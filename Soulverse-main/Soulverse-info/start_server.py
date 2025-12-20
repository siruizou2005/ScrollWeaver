#!/usr/bin/env python3
"""
简单的HTTP服务器，用于运行数字孪生生成器
"""
import http.server
import socketserver
import os
import webbrowser
import sys

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 添加CORS头，允许跨域请求
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def log_message(self, format, *args):
        # 简化日志输出
        pass

def main():
    # 切换到脚本所在目录
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    Handler = MyHTTPRequestHandler
    
    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            url = f"http://localhost:{PORT}/index.html"
            print("=" * 60)
            print("数字孪生生成器服务器已启动！")
            print("=" * 60)
            print(f"\n访问地址: {url}")
            print(f"\n按 Ctrl+C 停止服务器\n")
            print("=" * 60)
            
            # 自动打开浏览器
            try:
                webbrowser.open(url)
                print("\n已自动打开浏览器...")
            except:
                print("\n请手动在浏览器中打开上述地址")
            
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n服务器已停止")
        sys.exit(0)
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"\n错误: 端口 {PORT} 已被占用")
            print(f"请关闭占用该端口的程序，或修改脚本中的PORT值")
        else:
            print(f"\n错误: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

