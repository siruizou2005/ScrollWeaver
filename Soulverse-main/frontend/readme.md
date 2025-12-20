# Soulverse - 平行时空社交沙盒

基于多 Agent 模拟的"平行时空"社交沙盒的 Landing Page 和 Authentication Page。

## 技术栈

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **3D Engine**: @react-three/fiber, @react-three/drei
- **Animation**: Framer Motion
- **Icons**: Lucide React
- **Language**: TypeScript

## 设计风格

- **主题**: 深空 (Deep Space)、科幻 (Sci-Fi)、空灵 (Ethereal)
- **颜色**: #000000 (纯黑背景), #0f172a (深蓝), 霓虹青色和紫色
- **UI 风格**: 毛玻璃效果 (Glassmorphism)、细线条、未来感字体

## 功能特性

### Landing Page
- 3D 粒子星空背景，支持鼠标跟随效果
- 4 个全屏滚动板块：
  1. Hero - 超大标题和旋转星球
  2. What is Soulverse? - 项目介绍
  3. Core Gameplay - 三个核心玩法卡片
  4. Call to Action - 启动按钮
- Warp Speed 动画过渡效果

### Authentication Page
- 飞船驾驶舱风格设计
- 毛玻璃表单面板
- 科技感输入框（聚焦时高亮）
- Hyper-Drive 动画和欢迎语

## 安装和运行

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

### 构建生产版本

```bash
npm run build
npm start
```

## 项目结构

```
Soulverse/
├── app/
│   ├── auth/
│   │   └── page.tsx          # 认证页面
│   ├── globals.css            # 全局样式
│   ├── layout.tsx             # 根布局
│   └── page.tsx               # Landing Page
├── components/
│   ├── StarField.tsx          # 3D 粒子星空
│   ├── Planet.tsx             # 旋转星球
│   ├── Scene3D.tsx            # 3D 场景容器
│   ├── WarpEffect.tsx         # Warp Speed 动画
│   └── HyperDriveEffect.tsx   # Hyper-Drive 动画
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

## 主要组件说明

### StarField
创建包含数千个粒子的星空，支持鼠标跟随产生流体扰动效果。

### Planet
旋转的神秘核心星球，使用 MeshDistortMaterial 实现扭曲效果。

### WarpEffect
实现光速跃迁动画，星星被拉长成线条，最终白屏过渡。

### HyperDriveEffect
实现虫洞隧道效果，包含欢迎语显示。

## 注意事项

- 确保使用现代浏览器以获得最佳体验
- 3D 渲染需要 WebGL 支持
- 建议使用 Chrome、Firefox 或 Safari 最新版本
