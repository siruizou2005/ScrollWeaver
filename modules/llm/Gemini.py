from .BaseLLM import BaseLLM
import google.generativeai as genai
import os
import time
import threading
import json
from typing import Optional, List

class Gemini(BaseLLM):
    """
    Gemini API 封装类，用于调用 Google 的 Gemini 模型。
    
    需要设置环境变量 GEMINI_API_KEY 或在 config.json 中配置 GEMINI_API_KEY。
    支持的模型包括：
    - gemini-2.0-flash
    - gemini-1.5-flash
    - gemini-1.5-pro
    - gemini-2.5-flash-preview-04-17
    - gemini-2.5-pro-preview-05-06
    """
    
    def __init__(self, model="gemini-2.0-flash", timeout: Optional[int] = 20, display_name: Optional[str] = None):
        """
        初始化 Gemini 客户端。
        
        Args:
            model: 模型名称，默认为 gemini-2.0-flash
            timeout: API 调用超时时间（秒），默认 20 秒
            display_name: 用于日志输出的模型名称
        """
        super(Gemini, self).__init__()
        self.model_name = model
        self.display_model_name = display_name or model
        self.messages = []
        self.system_instruction = None
        self.timeout = timeout
        self.max_retries = 3  # 最大重试次数

        # 配置 API Key（支持多个 key 轮换）
        self.api_keys: List[str] = self._load_api_keys()
        self._api_key_lock = threading.Lock()
        self._api_key_index = 0
        self._current_api_key = None
        
        # 先配置第一个 key，确保后续调用正常
        initial_key = self.api_keys[0]
        self._configure_client(initial_key)
        # 先不创建 client，在需要时根据 system_instruction 创建

    def _load_api_keys(self) -> List[str]:
        """
        从环境变量中加载 API Key。支持以下格式：
        - GEMINI_API_KEYS: JSON 数组或逗号/分号分隔的字符串
        - GEMINI_API_KEY: 单个 key 或逗号/分号分隔的多个 key
        """
        raw_value = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY")
        if not raw_value:
            raise ValueError(
                "未检测到 GEMINI_API_KEY 或 GEMINI_API_KEYS。请在 config.json 或环境变量中配置。"
            )

        keys: List[str] = []
        raw_value = raw_value.strip()
        if raw_value.startswith("["):
            try:
                parsed = json.loads(raw_value)
                if isinstance(parsed, list):
                    keys = [str(item).strip() for item in parsed if str(item).strip()]
            except json.JSONDecodeError:
                pass

        if not keys:
            separators = [",", ";"]
            temp_value = raw_value
            for sep in separators:
                temp_value = temp_value.replace(sep, ",")
            keys = [item.strip() for item in temp_value.split(",") if item.strip()]

        if not keys:
            raise ValueError("未找到有效的 Gemini API Key，请检查配置。")

        return keys

    def _get_next_api_key(self) -> str:
        """轮询获取下一个 API Key。"""
        with self._api_key_lock:
            key = self.api_keys[self._api_key_index]
            self._api_key_index = (self._api_key_index + 1) % len(self.api_keys)
            return key

    def _configure_client(self, api_key: str):
        """使用指定 key 配置 Gemini 客户端。"""
        if api_key != self._current_api_key:
            genai.configure(api_key=api_key)
            self._current_api_key = api_key
            masked_key = api_key[:4] + "..." if len(api_key) > 8 else "****"
            print(f"[Gemini] 切换 API Key: {masked_key}")

    def initialize_message(self):
        """初始化消息列表。"""
        self.messages = []
        self.system_instruction = None

    def ai_message(self, payload):
        """
        添加 AI 回复消息。
        
        Args:
            payload: AI 消息内容（字符串）
        """
        self.messages.append({"role": "model", "content": payload})

    def system_message(self, payload):
        """
        添加系统提示消息。
        
        Args:
            payload: 系统提示内容
        """
        self.system_instruction = payload

    def user_message(self, payload):
        """
        添加用户消息。
        
        Args:
            payload: 用户消息内容
        """
        self.messages.append({"role": "user", "content": payload})

    def get_response(self, temperature=0.8):
        """
        获取模型响应，带超时和重试机制。
        
        Args:
            temperature: 温度参数，控制输出的随机性，默认 0.8
            
        Returns:
            模型生成的文本响应
        """
        last_exception = None
        
        # 重试机制
        for attempt in range(self.max_retries):
            try:
                api_key = self._get_next_api_key()
                self._configure_client(api_key)

                print(f"[Gemini] 开始 API 调用（尝试 {attempt + 1}/{self.max_retries}），模型: {self.display_model_name}，超时: {self.timeout}秒")
                # 创建模型实例，如果有 system_instruction 则传入
                if self.system_instruction:
                    model = genai.GenerativeModel(
                        model_name=self.model_name,
                        system_instruction=self.system_instruction
                    )
                else:
                    model = genai.GenerativeModel(model_name=self.model_name)
                
                # 构建生成配置
                generation_config = genai.types.GenerationConfig(temperature=temperature)
                
                # 使用 threading 实现跨平台超时
                response_result = [None]
                exception_result = [None]
                
                def api_call():
                    """执行 API 调用的函数"""
                    try:
                        # 如果有历史消息，使用聊天模式
                        if len(self.messages) > 1:
                            # 转换消息格式为 Gemini 格式
                            history = []
                            for msg in self.messages[:-1]:
                                if msg["role"] == "user":
                                    history.append({"role": "user", "parts": [msg["content"]]})
                                elif msg["role"] == "model":
                                    history.append({"role": "model", "parts": [msg["content"]]})
                            
                            # 创建聊天会话
                            chat = model.start_chat(history=history)
                            # 发送最后一条消息
                            last_message = self.messages[-1]["content"]
                            response_result[0] = chat.send_message(last_message, generation_config=generation_config)
                        else:
                            # 单次对话，直接生成
                            prompt = self.messages[0]["content"] if self.messages else ""
                            response_result[0] = model.generate_content(prompt, generation_config=generation_config)
                    except Exception as e:
                        exception_result[0] = e
                
                # 在单独线程中执行 API 调用
                api_thread = threading.Thread(target=api_call)
                api_thread.daemon = True
                api_thread.start()
                api_thread.join(timeout=self.timeout)
                
                # 检查是否超时
                if api_thread.is_alive():
                    raise TimeoutError(f"Gemini API 调用超时（{self.timeout}秒）")
                
                # 检查是否有异常
                if exception_result[0]:
                    raise exception_result[0]
                
                # 获取响应
                response = response_result[0]
                
                # 检查响应是否有效
                if not response or not hasattr(response, 'text'):
                    raise ValueError("Gemini API 返回了无效的响应")
                
                print(f"[Gemini] API 调用成功，响应长度: {len(response.text) if response.text else 0} 字符")
                return response.text
                
            except TimeoutError as e:
                last_exception = e
                print(f"Gemini API 调用超时（尝试 {attempt + 1}/{self.max_retries}）: {e}")
                if attempt < self.max_retries - 1:
                    wait_time = (attempt + 1) * 2  # 递增等待时间：2秒、4秒、6秒
                    print(f"等待 {wait_time} 秒后重试...")
                    time.sleep(wait_time)
                else:
                    raise
            except Exception as e:
                last_exception = e
                error_msg = str(e).lower()
                # 检查是否是网络错误或可重试的错误
                retryable_errors = ['timeout', 'connection', 'network', 'rate limit', '429', '503', '502', '500']
                is_retryable = any(keyword in error_msg for keyword in retryable_errors)
                
                if is_retryable and attempt < self.max_retries - 1:
                    print(f"Gemini API 调用错误（尝试 {attempt + 1}/{self.max_retries}）: {e}")
                    wait_time = (attempt + 1) * 2
                    print(f"等待 {wait_time} 秒后重试...")
                    time.sleep(wait_time)
                else:
                    print(f"Gemini API 调用错误: {e}")
                    import traceback
                    traceback.print_exc()
                    raise
        
        # 如果所有重试都失败
        if last_exception:
            raise last_exception
    
    def chat(self, text, temperature=0.8):
        """
        简单的聊天接口。
        
        Args:
            text: 用户输入的文本
            temperature: 温度参数，默认 0.8
            
        Returns:
            模型生成的文本响应
        """
        self.initialize_message()
        self.user_message(text)
        response = self.get_response(temperature=temperature)
        return response
    
    def print_prompt(self):
        """打印当前的消息历史（用于调试）。"""
        if self.system_instruction:
            print(f"System: {self.system_instruction}")
        for message in self.messages:
            print(f"{message['role']}: {message['content']}")