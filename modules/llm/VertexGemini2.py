from .BaseLLM2 import BaseLLM
import os

class VertexGemini(BaseLLM):
    def __init__(self, model="gemini-1.5-pro-002", project_id=None, location="us-central1"):
        super(VertexGemini, self).__init__()
        self.model_name = model
        self.project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        self.location = location
        self.messages = []
        
        # Initialize Vertex AI client lazily; genai may not be installed in the environment.
        try:
            from google import genai
            self.client = genai.Client(
                vertexai=True,
                project=self.project_id,
                location=self.location
            )
        except Exception:
            # If genai (or google) is not available, set client to None.
            # get_response will raise a clear error when called.
            self.client = None

    def initialize_message(self):
        self.messages = []

    def ai_message(self, payload):
        self.messages.append({"role": "model", "parts": [{"text": payload}]})

    def system_message(self, payload):
        # Vertex AI Gemini may treat system messages as user-scoped instructions
        self.messages.append({"role": "user", "parts": [{"text": f"System: {payload}"}]})

    def user_message(self, payload):
        self.messages.append({"role": "user", "parts": [{"text": payload}]})

    def get_response(self, temperature=0.8, max_output_tokens=1024):
        # Build contents for the Vertex generate_content API
        contents = []
        for message in self.messages:
            contents.append({
                "role": message["role"],
                "parts": message["parts"]
            })
        
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=contents,
            generation_config={
                "temperature": temperature,
                "max_output_tokens": max_output_tokens,
            }
        )
        # response.text contains the generated text in genai SDK
        return getattr(response, 'text', str(response))
    
    def chat(self, text, temperature=0.8, max_output_tokens=1024):
        self.initialize_message()
        self.user_message(text)
        response = self.get_response(temperature=temperature, max_output_tokens=max_output_tokens)
        return response
    
    def print_prompt(self):
        for message in self.messages:
            print(f"{message['role']}: {message['parts'][0]['text']}")
