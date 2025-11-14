import sys
sys.path.append("../")
from chromadb.api.types import Embeddings, Documents, EmbeddingFunction, Space
from modelscope import AutoModel, AutoTokenizer
from functools import partial
from sw_utils import get_child_folders
import torch
import os
import hashlib
import random
from typing import Iterable, List


class EmbeddingModel(EmbeddingFunction[Documents]):
    def __init__(self, model_name, language='en'):
        self.model_name = model_name
        self.language = language
        self.tokenizer = None
        self.model = None
        self._fallback = False
        self._fallback_dim = 384

        cache_root = os.path.expanduser(os.environ.get("MODELSCOPE_CACHE", "~/.cache/modelscope/hub"))
        local_snapshot_root = ""
        if "/" in model_name:
            model_provider, model_smallname = model_name.split("/", 1)
            local_snapshot_root = os.path.join(cache_root, f"models--{model_provider}--{model_smallname}/snapshots/")

        try:
            if local_snapshot_root and os.path.exists(local_snapshot_root) and get_child_folders(local_snapshot_root):
                snapshot_dir = os.path.join(local_snapshot_root, get_child_folders(local_snapshot_root)[0])
                self.tokenizer = AutoTokenizer.from_pretrained(snapshot_dir)
                self.model = AutoModel.from_pretrained(snapshot_dir)
            else:
                self.tokenizer = AutoTokenizer.from_pretrained(model_name)
                self.model = AutoModel.from_pretrained(model_name)
        except Exception as exc:
            print(f"Warning: Failed to load embedding model '{model_name}' ({exc}). Falling back to hash-based embeddings.")
            self._fallback = True

    def __call__(self, input: Documents) -> Embeddings:
        if isinstance(input, str):
            return self.embed_query(input)
        return self.embed_documents(list(input))

    def embed_documents(self, texts: Iterable[str]) -> List[List[float]]:
        texts = list(texts)
        if self._fallback or self.tokenizer is None or self.model is None:
            return [self._hash_embed(text) for text in texts]

        inputs = self.tokenizer(texts, return_tensors="pt", padding=True, truncation=True, max_length=256)
        with torch.no_grad():
            outputs = self.model(**inputs)
        embeddings = outputs.last_hidden_state[:, 0, :].tolist()
        return embeddings

    def embed_query(self, text: str = None, **kwargs) -> List[float]:
        # Handle case where 'input' keyword argument is passed instead of positional
        if text is None and 'input' in kwargs:
            text = kwargs['input']
        if text is None:
            raise ValueError("embed_query requires 'text' or 'input' argument")
        return self.embed_documents([text])[0]

    def _hash_embed(self, text: str) -> List[float]:
        seed = int(hashlib.sha256(text.encode("utf-8")).hexdigest(), 16)
        rng = random.Random(seed)
        return [rng.random() for _ in range(self._fallback_dim)]

class OpenAIEmbedding(EmbeddingFunction[Documents]):
    def __init__(self, model_name="text-embedding-ada-002", base_url=None, api_key_field = "OPENAI_API_KEY"):
        from openai import OpenAI
        # allow overriding base URL via OPENAI_API_BASE environment variable (e.g. apiyi mirror)
        env_base = os.getenv('OPENAI_API_BASE', '')
        if env_base:
            # If env provided, it should point to the API root (e.g. https://api.apiyi.com/v1)
            base_url = env_base
        # default: base_url may be None, OpenAI client will use default
        client_kwargs = {
            'api_key': os.environ.get(api_key_field, None)
        }
        if base_url:
            client_kwargs['base_url'] = base_url

        self.client = OpenAI(**client_kwargs)
        self.model_name = model_name

    def __call__(self, input):
        if isinstance(input, str):
            input = input.replace("\n", " ")
            return self.client.embeddings.create(input=[input], model=self.model_name).data[0].embedding
        elif isinstance(input,list):
            return [self.client.embeddings.create(input=[sentence.replace("\n", " ")], model=self.model_name).data[0].embedding for sentence in input]

def get_embedding_model(embed_name, language='en'):
    local_model_dict = {
        "bge-m3":"BAAI/bge-m3",
        "bge-large": f"BAAI/bge-large-{language}",
        "luotuo": "silk-road/luotuo-bert-medium",
        "bert": "google-bert/bert-base-multilingual-cased",
        "bge-small": f"BAAI/bge-small-{language}",
    }
    online_model_dict = {
        "openai":
            {"model_name":"text-embedding-ada-002",
             "url":"https://api.apiyi.com/v1/embeddings",
             "api_key_field":"OPENAI_API_KEY"},

    }
    if embed_name in local_model_dict:
        model_name = local_model_dict[embed_name]
        return EmbeddingModel(model_name, language=language)
    if embed_name in online_model_dict:
        model_name = online_model_dict[embed_name]["model_name"]
        api_key_field = online_model_dict[embed_name]["api_key_field"]
        base_url = online_model_dict[embed_name]["url"]
        return OpenAIEmbedding(model_name=model_name, base_url=base_url,api_key_field=api_key_field)
    return EmbeddingModel(embed_name, language=language)
