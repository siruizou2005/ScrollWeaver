<!-- a3c3bf9b-8c2c-454b-832b-a15a60b3dd63 57f05890-6e99-40e9-b31c-335486f6d9e1 -->
# ScrollWeaver 项目模块化重构计划

## 重构目标

1. 将 `ScrollWeaver.py` 中的 `Server` 类（937行）拆分为多个职责单一的模块
2. 重组 `sw_utils.py` 中的工具函数，按功能分类
3. 简化 `server.py` 中的 `ConnectionManager`，提取业务逻辑
4. 保持现有功能完整性，确保向后兼容

## 模块拆分方案

### 1. 核心模拟模块 (`modules/simulation/`)

- **`simulator.py`** - 核心模拟循环逻辑
  - `simulate_generator()` 方法
  - 模拟流程控制
  - 轮次管理

- **`interaction_handler.py`** - 交互处理
  - `start_single_role_interaction()` - 单角色交互
  - `start_multi_role_interaction()` - 多角色交互
  - `start_npc_interaction()` - NPC交互
  - `start_enviroment_interaction()` - 环境交互
  - `implement_next_plan()` - 计划执行

- **`event_manager.py`** - 事件和脚本管理
  - `get_event()` - 获取事件
  - `get_script()` - 获取脚本
  - `update_event()` - 更新事件
  - `script_instruct()` - 脚本指令

- **`movement_manager.py`** - 移动管理
  - `decide_whether_to_move()` - 决定是否移动
  - `settle_movement()` - 处理移动结算
  - 移动状态管理

- **`scene_manager.py`** - 场景管理
  - 场景角色选择
  - 场景状态管理
  - `scene_characters` 管理

- **`state_manager.py`** - 状态管理
  - `_get_status_text()` - 获取状态文本
  - `_get_group_members_info_text()` - 获取组员信息
  - `_get_locations_info()` - 获取地点信息
  - `_get_group_members_info_dict()` - 获取组员信息字典
  - `_find_group()` - 查找组
  - `_find_roles_at_location()` - 查找地点角色

- **`persistence.py`** - 持久化
  - `_save_current_simulation()` - 保存模拟
  - `continue_simulation_from_file()` - 从文件继续
  - `__getstate__()` / `__setstate__()` - 序列化

- **`record_manager.py`** - 记录管理
  - `record()` - 记录方法
  - 记录格式化

### 2. 工具函数模块 (`modules/utils/`)

- **`role_utils.py`** - 角色相关工具
  - `_name2code()` - 名称转代码
  - `check_role_code_availability()` - 检查角色代码可用性

- **`location_utils.py`** - 地点相关工具
  - 地点查找和转换函数

- **`text_utils.py`** - 文本处理工具
  - `conceal_thoughts()` - 隐藏思考
  - `action_detail_decomposer()` - 动作详情分解
  - `merge_text_with_limit()` - 合并文本
  - `normalize_string()` - 标准化字符串
  - `fuzzy_match()` - 模糊匹配

- **`file_utils.py`** - 文件操作工具
  - `load_json_file()` / `save_json_file()`
  - `load_text_file()` / `save_text_file()`
  - `load_jsonl_file()` / `save_jsonl_file()`
  - `get_child_paths()` / `get_child_folders()` / `get_grandchild_folders()`
  - `find_files_with_suffix()`

- **`model_utils.py`** - 模型相关工具
  - `get_models()` - 获取模型（从 sw_utils 移入）
  - `build_db()` - 构建数据库
  - `build_orchestrator_data()` - 构建编排器数据

- **`logger_utils.py`** - 日志工具
  - `get_logger()` - 获取日志器

### 3. 服务器模块优化 (`modules/server/`)

- **`connection_manager.py`** - 连接管理（从 server.py 提取）
  - WebSocket 连接管理
  - 客户端状态管理

- **`story_service.py`** - 故事服务
  - 故事生成逻辑
  - 用户输入处理
  - AI自动完成

### 4. 初始化模块 (`modules/core/`)

- **`server.py`** - 重构后的 Server 类
  - 保留初始化逻辑
  - 组合各个模块
  - 提供统一接口

- **`config_loader.py`** - 配置加载
  - 配置文件加载
  - 配置验证

## 实施步骤

### 阶段1：创建新模块结构

1. 创建 `modules/simulation/` 目录
2. 创建 `modules/utils/` 目录
3. 创建 `modules/server/` 目录（可选）
4. 创建 `modules/core/` 目录

### 阶段2：拆分 Server 类

1. 提取交互处理逻辑到 `interaction_handler.py`
2. 提取事件管理逻辑到 `event_manager.py`
3. 提取移动管理逻辑到 `movement_manager.py`
4. 提取场景管理逻辑到 `scene_manager.py`
5. 提取状态管理逻辑到 `state_manager.py`
6. 提取持久化逻辑到 `persistence.py`
7. 提取记录管理逻辑到 `record_manager.py`
8. 重构 `simulator.py` 为核心模拟循环

### 阶段3：重组工具函数

1. 将工具函数按功能分类移动到 `modules/utils/`
2. 更新所有导入语句
3. 确保向后兼容

### 阶段4：重构 Server 类

1. 重构 `Server` 类使用新模块
2. 保持原有接口不变
3. 更新 `ScrollWeaver` 类（如果需要）

### 阶段5：测试和验证

1. 运行现有测试
2. 验证功能完整性
3. 修复导入错误
4. 更新文档

## 文件结构（重构后）

```
ScrollWeaver/
├── ScrollWeaver.py (简化，主要包含 ScrollWeaver 类和入口)
├── server.py (简化，主要包含 FastAPI 路由)
├── sw_utils.py (保留核心工具函数，其他移至 modules/utils)
├── modules/
│   ├── simulation/
│   │   ├── __init__.py
│   │   ├── simulator.py
│   │   ├── interaction_handler.py
│   │   ├── event_manager.py
│   │   ├── movement_manager.py
│   │   ├── scene_manager.py
│   │   ├── state_manager.py
│   │   ├── persistence.py
│   │   └── record_manager.py
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── role_utils.py
│   │   ├── location_utils.py
│   │   ├── text_utils.py
│   │   ├── file_utils.py
│   │   ├── model_utils.py
│   │   └── logger_utils.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── server.py (重构后的 Server 类)
│   │   └── config_loader.py
│   └── ... (现有模块)
```

## 注意事项

1. 保持向后兼容，不改变外部接口
2. 逐步迁移，确保每个阶段都能正常运行
3. 更新所有导入语句
4. 保持现有功能完整性
5. 遵循单一职责原则
6. 添加适当的文档字符串

## 关键文件修改

- `ScrollWeaver.py` - 大幅简化，Server 类移至 `modules/core/server.py`
- `sw_utils.py` - 保留核心函数，其他移至 `modules/utils/`
- `server.py` - 简化 ConnectionManager，提取业务逻辑
- 新建多个模块文件

## 预期收益

1. 提高代码可维护性
2. 提高代码可读性
3. 便于单元测试
4. 便于功能扩展
5. 降低耦合度