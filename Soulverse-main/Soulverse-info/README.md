# 数字孪生生成器 - Digital Twin Generator

一个独立的网页工具，用于帮助用户生成自己的数字孪生（AI Agent）人格画像。

## 功能特点

1. **MBTI类型识别**
   - 已知MBTI：直接选择你的MBTI类型
   - 未知MBTI：完成20题问卷，自动识别你的MBTI类型

2. **核心层数据生成**
   - 直接进入：使用MBTI基础数据快速创建
   - 深入构建：完成20题核心层问卷，生成完整的Big Five人格评分、价值观和防御机制

3. **表象层数据提取**
   - 跳过：使用默认语言风格
   - 上传聊天记录：分析你的真实语言风格，包括句长、词汇、表情使用、口头禅等

4. **AI生成**
   - 使用Gemini 2.5 Flash模型生成完整的三层人格模型数据

## 快速开始

### 方法一：使用Python服务器（推荐）

#### macOS/Linux用户：

```bash
cd digital_twin_generator
python3 start_server.py
```

或者使用启动脚本：

```bash
cd digital_twin_generator
./start_server.sh
```

#### Windows用户：

双击运行 `digital_twin_generator/start_server.bat` 文件

#### 访问应用

浏览器会自动打开，如果没有自动打开，请手动访问：`http://localhost:8000/index.html`

### 方法二：使用其他HTTP服务器

如果你安装了Node.js，可以使用：

```bash
cd digital_twin_generator
npx http-server -p 8000
```

然后访问：`http://localhost:8000/index.html`

### 方法三：直接打开（可能有问题）

**注意：** 直接双击打开 `index.html` 文件可能会因为浏览器的安全策略导致API调用失败。

如果必须直接打开：
1. 双击 `digital_twin_generator/index.html` 文件
2. 如果API调用失败，请使用方法一或方法二

## 项目结构

```
.
└── digital_twin_generator/
    ├── index.html          # 主HTML文件
    ├── styles.css          # 样式文件
    ├── app.js             # JavaScript逻辑文件
    ├── start_server.py     # Python服务器启动脚本
    ├── start_server.sh     # Linux/Mac启动脚本
    ├── start_server.bat    # Windows启动脚本
    ├── README.md          # 详细说明文档
    └── 使用说明.md        # 中文使用说明
```

## 技术栈

- **前端**: 纯HTML/CSS/JavaScript（无框架依赖）
- **API**: Google Gemini 2.5 Flash模型
- **样式**: 现代化设计，使用渐变、玻璃态效果等

## API配置

当前使用的Gemini API Key已配置在 `digital_twin_generator/app.js` 中：

```javascript
const GEMINI_API_KEY = 'REDACTED';
const GEMINI_MODEL = 'gemini-2.5-flash';
```

如需更换API Key，请编辑 `digital_twin_generator/app.js` 文件。

## 数据格式

生成的数据遵循三层人格模型格式：

```json
{
  "core_traits": {
    "mbti": "INFP",
    "big_five": {
      "openness": 0.85,
      "conscientiousness": 0.35,
      "extraversion": 0.25,
      "agreeableness": 0.75,
      "neuroticism": 0.65
    },
    "values": ["真诚", "自由", "审美"],
    "defense_mechanism": "Sublimation"
  },
  "speaking_style": {
    "sentence_length": "medium",
    "vocabulary_level": "casual",
    "punctuation_habit": "standard",
    "emoji_usage": {
      "frequency": "medium",
      "preferred": ["✨", "📚"],
      "avoided": []
    },
    "catchphrases": ["确实", "有点意思"],
    "tone_markers": ["啊", "呢"]
  },
  "dynamic_state": {
    "current_mood": "neutral",
    "energy_level": 70,
    "relationship_map": {}
  }
}
```

## 微信聊天记录格式

支持的微信聊天记录格式：

```
————— 2024-01-01 —————
张三 14:30
你好，最近怎么样？

李四 14:32
还不错，你呢？
```

## 常见问题

### Q: 提示端口被占用怎么办？
A: 修改 `digital_twin_generator/start_server.py` 文件中的 `PORT = 8000` 改为其他端口（如8001、8080等）

### Q: 提示找不到Python？
A: 
- macOS/Linux: 安装Python 3: `brew install python3` 或 `sudo apt-get install python3`
- Windows: 从 https://www.python.org/downloads/ 下载安装

### Q: 页面打开了但是API调用失败？
A: 
1. 检查网络连接
2. 检查浏览器控制台（F12）是否有错误信息
3. 确认Gemini API Key是否有效

### Q: 页面样式显示不正常？
A: 确保 `styles.css` 文件与 `index.html` 在同一目录下

## 注意事项

1. 需要网络连接以调用Gemini API
2. 生成过程可能需要30-60秒，请耐心等待
3. 聊天记录分析功能需要提供足够多的聊天内容才能准确提取语言风格

## 浏览器兼容性

- Chrome/Edge (推荐)
- Firefox
- Safari

## 未来改进

- [ ] 添加更多问卷题目选项
- [ ] 支持更多聊天记录格式
- [ ] 添加数据可视化展示
- [ ] 支持导出为其他格式
- [ ] 添加历史记录功能

## 许可证

本项目采用 MIT 许可证。
