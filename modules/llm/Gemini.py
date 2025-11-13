from .BaseLLM import BaseLLM
import google.generativeai as genai
import os
import time

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
    
    def __init__(self, model="gemini-2.0-flash"):
        """
        初始化 Gemini 客户端。
        
        Args:
            model: 模型名称，默认为 gemini-2.0-flash
        """
        super(Gemini, self).__init__()
        self.model_name = model
        self.messages = []
        self.system_instruction = None
        
        # 配置 API Key
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY 环境变量未设置。请在 config.json 中配置 GEMINI_API_KEY 或设置环境变量。")
        
        genai.configure(api_key=api_key)
        # 先不创建 client，在需要时根据 system_instruction 创建

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
        获取模型响应。
        
        Args:
            temperature: 温度参数，控制输出的随机性，默认 0.8
            
        Returns:
            模型生成的文本响应
        """
        try:
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
                response = chat.send_message(last_message, generation_config=generation_config)
            else:
                # 单次对话，直接生成
                prompt = self.messages[0]["content"] if self.messages else ""
                response = model.generate_content(prompt, generation_config=generation_config)
            
            return response.text
        except Exception as e:
            print(f"Gemini API 调用错误: {e}")
            import traceback
            traceback.print_exc()
            raise
    
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