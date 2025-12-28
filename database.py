"""
数据库模型和用户认证系统
"""
import sqlite3
import hashlib
import secrets
from datetime import datetime
from typing import Optional, Dict, List
import json
import os

class Database:
    def __init__(self, db_path: str = "scrollweaver.db"):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """初始化数据库表"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 用户表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                email TEXT,
                created_at TEXT NOT NULL,
                last_login TEXT
            )
        ''')
        
        # 书卷表（包括系统预设和用户创建的书卷）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS scrolls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                title TEXT NOT NULL,
                description TEXT,
                cover_image TEXT,
                scroll_type TEXT NOT NULL,  -- 'system', 'user', 'shared'
                preset_path TEXT,  -- 预设文件路径
                world_dir TEXT,  -- 世界数据目录
                is_public INTEGER DEFAULT 0,  -- 是否公开分享
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')
        
        # 故事表（用户生成的故事记录）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS stories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                scroll_id INTEGER,
                title TEXT NOT NULL,
                content TEXT,
                story_data TEXT,  -- JSON格式的故事数据
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (scroll_id) REFERENCES scrolls(id)
            )
        ''')
        
        # 用户会话token表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT UNIQUE NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')
        
        # 商业博弈游戏记录表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS business_games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                username TEXT NOT NULL,
                game_id TEXT UNIQUE NOT NULL,
                total_profit REAL NOT NULL DEFAULT 0,
                total_rounds INTEGER NOT NULL DEFAULT 0,
                history TEXT,  -- JSON格式的游戏历史
                created_at TEXT NOT NULL,
                finished_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')
        
        # 联机房间表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS multiplayer_rooms (
                id TEXT PRIMARY KEY,
                scroll_id INTEGER NOT NULL,
                host_id INTEGER NOT NULL,
                password TEXT,
                status TEXT NOT NULL DEFAULT 'matching',  -- 'matching', 'playing', 'finished'
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (scroll_id) REFERENCES scrolls(id),
                FOREIGN KEY (host_id) REFERENCES users(id)
            )
        ''')
        
        # 联机房间玩家表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS multiplayer_room_players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                username TEXT NOT NULL,
                confirmed INTEGER DEFAULT 0,
                selected_role TEXT,
                joined_at TEXT NOT NULL,
                FOREIGN KEY (room_id) REFERENCES multiplayer_rooms(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(room_id, user_id)
            )
        ''')
        
        # 人格模型表（Soulverse数字孪生）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS persona_models (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                profile TEXT NOT NULL,  -- JSON格式的人格画像数据
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')
        
        # 创建索引以提高查询性能
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_business_games_user_id ON business_games(user_id)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_business_games_total_profit ON business_games(total_profit DESC)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_multiplayer_rooms_scroll_id ON multiplayer_rooms(scroll_id)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_multiplayer_rooms_host_id ON multiplayer_rooms(host_id)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_multiplayer_room_players_room_id ON multiplayer_room_players(room_id)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_multiplayer_room_players_user_id ON multiplayer_room_players(user_id)
        ''')
        
        conn.commit()
        conn.close()
        
        # 初始化系统预设书卷
        self.init_system_scrolls()
    
    def init_system_scrolls(self):
        """初始化系统预设书卷"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 检查是否已有系统预设
        cursor.execute('SELECT COUNT(*) FROM scrolls WHERE scroll_type = ?', ('system',))
        if cursor.fetchone()[0] > 0:
            conn.close()
            return
        
        # 读取预设文件目录
        presets_dir = './experiment_presets'
        if os.path.exists(presets_dir):
            # 只加载系统预设文件，忽略用户创建的本地文件（以user_开头的文件）
            preset_names = {
                'example_free.json': '自由模式示例',
                'example_script.json': '剧本模式示例',
                'experiment_alice.json': '爱丽丝梦游仙境',
                'experiment_icefire_bloody_wedding.json': '冰与火之歌：血色婚礼',
                'experiment_icefire.json': '冰与火之歌',
                'experiment_red_mansions.json': '红楼梦',
                'experiment_three_kindoms.json': '三国演义'
            }
            
            # 只处理系统预设文件，忽略用户创建的本地文件
            for preset_file in preset_names.keys():
                preset_path = os.path.join(presets_dir, preset_file)
                # 只加载存在的系统预设文件
                if not os.path.exists(preset_path):
                    continue
                    
                preset_name = preset_names[preset_file]
                
                cursor.execute('''
                    INSERT INTO scrolls (user_id, title, description, scroll_type, preset_path, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    None,
                    preset_name,
                    f'系统预设：{preset_name}',
                    'system',
                    preset_path,
                    datetime.now().isoformat(),
                    datetime.now().isoformat()
                ))
        
        conn.commit()
        conn.close()
    
    def hash_password(self, password: str) -> str:
        """密码哈希"""
        return hashlib.sha256(password.encode()).hexdigest()
    
    def create_user(self, username: str, password: str, email: Optional[str] = None) -> Optional[int]:
        """创建用户"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            password_hash = self.hash_password(password)
            cursor.execute('''
                INSERT INTO users (username, password_hash, email, created_at)
                VALUES (?, ?, ?, ?)
            ''', (username, password_hash, email, datetime.now().isoformat()))
            
            user_id = cursor.lastrowid
            conn.commit()
            return user_id
        except sqlite3.IntegrityError:
            return None
        finally:
            conn.close()
    
    def verify_user(self, username: str, password: str) -> Optional[Dict]:
        """验证用户登录"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        password_hash = self.hash_password(password)
        cursor.execute('''
            SELECT id, username, email FROM users
            WHERE username = ? AND password_hash = ?
        ''', (username, password_hash))
        
        result = cursor.fetchone()
        if result:
            user_id, username, email = result
            # 更新最后登录时间
            cursor.execute('''
                UPDATE users SET last_login = ? WHERE id = ?
            ''', (datetime.now().isoformat(), user_id))
            conn.commit()
            conn.close()
            return {'id': user_id, 'username': username, 'email': email}
        
        conn.close()
        return None
    
    def create_token(self, user_id: int) -> str:
        """创建用户token"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now().timestamp() + 7 * 24 * 3600  # 7天过期
        
        cursor.execute('''
            INSERT INTO user_tokens (user_id, token, expires_at, created_at)
            VALUES (?, ?, ?, ?)
        ''', (user_id, token, datetime.fromtimestamp(expires_at).isoformat(), datetime.now().isoformat()))
        
        conn.commit()
        conn.close()
        return token
    
    def verify_token(self, token: str) -> Optional[Dict]:
        """验证token"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT u.id, u.username, u.email, ut.expires_at
            FROM users u
            JOIN user_tokens ut ON u.id = ut.user_id
            WHERE ut.token = ?
        ''', (token,))
        
        result = cursor.fetchone()
        if result:
            user_id, username, email, expires_at = result
            if datetime.fromisoformat(expires_at) > datetime.now():
                conn.close()
                return {'id': user_id, 'username': username, 'email': email}
            else:
                # token过期，删除
                cursor.execute('DELETE FROM user_tokens WHERE token = ?', (token,))
                conn.commit()
        
        conn.close()
        return None
    
    def create_scroll(self, user_id: int, title: str, description: str, 
                     scroll_type: str, preset_path: Optional[str] = None,
                     world_dir: Optional[str] = None, is_public: bool = False) -> int:
        """创建书卷"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO scrolls (user_id, title, description, scroll_type, preset_path, world_dir, is_public, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, title, description, scroll_type, preset_path, world_dir, 
             1 if is_public else 0, datetime.now().isoformat(), datetime.now().isoformat()))
        
        scroll_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return scroll_id
    
    def get_scrolls(self, user_id: Optional[int] = None, scroll_type: Optional[str] = None, 
                   include_public: bool = True) -> List[Dict]:
        """获取书卷列表"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        query = 'SELECT id, user_id, title, description, cover_image, scroll_type, preset_path, world_dir, is_public, created_at FROM scrolls WHERE 1=1'
        params = []
        
        if scroll_type:
            query += ' AND scroll_type = ?'
            params.append(scroll_type)
        else:
            # 如果没有指定类型，默认包含系统预设和公开的书卷
            if user_id is not None:
                # 登录用户：自己的书卷 + 公开的书卷 + 系统预设
                query += ' AND (user_id = ? OR is_public = 1 OR scroll_type = ?)'
                params.extend([user_id, 'system'])
            else:
                # 未登录用户：系统预设 + 公开的书卷
                query += ' AND (scroll_type = ? OR is_public = 1)'
                params.append('system')
        
        query += ' ORDER BY scroll_type DESC, created_at DESC'
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        scrolls = []
        for row in results:
            scrolls.append({
                'id': row[0],
                'user_id': row[1],
                'title': row[2],
                'description': row[3],
                'cover_image': row[4],
                'scroll_type': row[5],
                'preset_path': row[6],
                'world_dir': row[7],
                'is_public': bool(row[8]),
                'created_at': row[9]
            })
        
        conn.close()
        return scrolls
    
    def get_scroll(self, scroll_id: int) -> Optional[Dict]:
        """获取单个书卷"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, user_id, title, description, cover_image, scroll_type, preset_path, world_dir, is_public, created_at
            FROM scrolls WHERE id = ?
        ''', (scroll_id,))
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            return {
                'id': result[0],
                'user_id': result[1],
                'title': result[2],
                'description': result[3],
                'cover_image': result[4],
                'scroll_type': result[5],
                'preset_path': result[6],
                'world_dir': result[7],
                'is_public': bool(result[8]),
                'created_at': result[9]
            }
        return None
    
    def save_story(self, user_id: int, scroll_id: Optional[int], title: str, 
                  content: str, story_data: Dict) -> int:
        """保存故事"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO stories (user_id, scroll_id, title, content, story_data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, scroll_id, title, content, json.dumps(story_data, ensure_ascii=False),
              datetime.now().isoformat(), datetime.now().isoformat()))
        
        story_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return story_id
    
    def update_scroll_share_status(self, scroll_id: int, is_public: bool, user_id: int) -> bool:
        """更新书卷的共享状态（只有书卷所有者可以更新）"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 检查书卷是否存在且属于该用户
        cursor.execute('''
            SELECT user_id FROM scrolls WHERE id = ?
        ''', (scroll_id,))
        result = cursor.fetchone()
        
        if not result:
            conn.close()
            return False
        
        if result[0] != user_id:
            conn.close()
            return False
        
        # 更新共享状态
        cursor.execute('''
            UPDATE scrolls SET is_public = ?, updated_at = ? WHERE id = ?
        ''', (1 if is_public else 0, datetime.now().isoformat(), scroll_id))
        
        conn.commit()
        conn.close()
        return True
    
    def get_shared_scrolls(self, current_user_id: int) -> List[Dict]:
        """获取共享的书卷列表（包括当前用户自己共享的书卷）"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 获取所有共享的书卷（包括用户自己的），并关联用户信息
        cursor.execute('''
            SELECT s.id, s.user_id, s.title, s.description, s.cover_image, s.scroll_type, 
                   s.preset_path, s.world_dir, s.is_public, s.created_at, u.username
            FROM scrolls s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.is_public = 1 AND s.scroll_type != 'system'
            ORDER BY s.created_at DESC
        ''', ())
        
        results = cursor.fetchall()
        scrolls = []
        for row in results:
            scrolls.append({
                'id': row[0],
                'user_id': row[1],
                'title': row[2],
                'description': row[3],
                'cover_image': row[4],
                'scroll_type': row[5],
                'preset_path': row[6],
                'world_dir': row[7],
                'is_public': bool(row[8]),
                'created_at': row[9],
                'author': row[10]  # 共享人用户名
            })
        
        conn.close()
        return scrolls
    
    def get_user_stories(self, user_id: int) -> List[Dict]:
        """获取用户的故事列表"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, scroll_id, title, content, created_at, updated_at
            FROM stories WHERE user_id = ? ORDER BY updated_at DESC
        ''', (user_id,))
        
        results = cursor.fetchall()
        stories = []
        for row in results:
            stories.append({
                'id': row[0],
                'scroll_id': row[1],
                'title': row[2],
                'content': row[3],
                'created_at': row[4],
                'updated_at': row[5]
            })
        
        conn.close()
        return stories
    
    def get_story(self, story_id: int, user_id: Optional[int] = None) -> Optional[Dict]:
        """获取单个故事"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        if user_id:
            cursor.execute('''
                SELECT id, user_id, scroll_id, title, content, story_data, created_at, updated_at
                FROM stories WHERE id = ? AND user_id = ?
            ''', (story_id, user_id))
        else:
            cursor.execute('''
                SELECT id, user_id, scroll_id, title, content, story_data, created_at, updated_at
                FROM stories WHERE id = ?
            ''', (story_id,))
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            return {
                'id': result[0],
                'user_id': result[1],
                'scroll_id': result[2],
                'title': result[3],
                'content': result[4],
                'story_data': json.loads(result[5]) if result[5] else {},
                'created_at': result[6],
                'updated_at': result[7]
            }
        return None
    
    def save_business_result(self, user_id: int, username: str, game_id: str, 
                            total_profit: float, total_rounds: int, history: List[Dict]) -> bool:
        """保存商业博弈游戏结果"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # 检查是否已存在该游戏记录
            cursor.execute('SELECT id FROM business_games WHERE game_id = ?', (game_id,))
            existing = cursor.fetchone()
            
            history_json = json.dumps(history, ensure_ascii=False)
            
            if existing:
                # 更新现有记录
                cursor.execute('''
                    UPDATE business_games 
                    SET total_profit = ?, total_rounds = ?, history = ?, finished_at = ?
                    WHERE game_id = ?
                ''', (total_profit, total_rounds, history_json, datetime.now().isoformat(), game_id))
            else:
                # 插入新记录
                cursor.execute('''
                    INSERT INTO business_games 
                    (user_id, username, game_id, total_profit, total_rounds, history, created_at, finished_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (user_id, username, game_id, total_profit, total_rounds, history_json,
                      datetime.now().isoformat(), datetime.now().isoformat()))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"保存商业博弈结果失败: {e}")
            conn.close()
            return False
    
    def get_business_leaderboard(self, limit: int = 100) -> List[Dict]:
        """获取商业博弈排行榜（按累计利润降序）"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 获取每个用户的最佳成绩（累计利润最高的那一局）
        cursor.execute('''
            SELECT user_id, username, MAX(total_profit) as best_profit, 
                   COUNT(*) as game_count, MAX(finished_at) as last_played
            FROM business_games
            GROUP BY user_id, username
            ORDER BY best_profit DESC
            LIMIT ?
        ''', (limit,))
        
        results = cursor.fetchall()
        leaderboard = []
        
        for row in results:
            user_id, username, best_profit, game_count, last_played = row
            leaderboard.append({
                'user_id': user_id,
                'username': username,
                'total_profit': round(best_profit, 2),  # 使用最佳成绩作为排行榜依据
                'game_count': game_count,
                'last_played': last_played
            })
        
        conn.close()
        return leaderboard
    
    def get_user_business_stats(self, user_id: int) -> Optional[Dict]:
        """获取用户的商业博弈统计信息"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT COUNT(*) as total_games, 
                   MAX(total_profit) as best_profit,
                   AVG(total_profit) as avg_profit,
                   SUM(total_profit) as total_profit_sum
            FROM business_games
            WHERE user_id = ?
        ''', (user_id,))
        
        result = cursor.fetchone()
        conn.close()
        
        if result and result[0] > 0:
            return {
                'total_games': result[0],
                'best_profit': round(result[1] or 0, 2),
                'avg_profit': round(result[2] or 0, 2),
                'total_profit_sum': round(result[3] or 0, 2)
            }
        return None
    
    def create_persona_model(self, user_id: int, name: str, profile: Dict) -> Optional[int]:
        """创建人格模型"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            profile_json = json.dumps(profile, ensure_ascii=False)
            now = datetime.now().isoformat()
            
            cursor.execute('''
                INSERT INTO persona_models (user_id, name, profile, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
            ''', (user_id, name, profile_json, now, now))
            
            model_id = cursor.lastrowid
            conn.commit()
            conn.close()
            return model_id
        except Exception as e:
            conn.rollback()
            conn.close()
            print(f"Error creating persona model: {e}")
            return None
    
    def get_persona_models(self, user_id: int) -> List[Dict]:
        """获取用户的所有人格模型"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, name, profile, created_at, updated_at
            FROM persona_models
            WHERE user_id = ?
            ORDER BY created_at DESC
        ''', (user_id,))
        
        results = cursor.fetchall()
        conn.close()
        
        models = []
        for result in results:
            models.append({
                'id': result[0],
                'name': result[1],
                'profile': json.loads(result[2]) if result[2] else {},
                'created_at': result[3],
                'updated_at': result[4]
            })
        
        return models
    
    def get_persona_model(self, model_id: int, user_id: Optional[int] = None) -> Optional[Dict]:
        """获取指定的人格模型"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        if user_id:
            cursor.execute('''
                SELECT id, user_id, name, profile, created_at, updated_at
                FROM persona_models
                WHERE id = ? AND user_id = ?
            ''', (model_id, user_id))
        else:
            cursor.execute('''
                SELECT id, user_id, name, profile, created_at, updated_at
                FROM persona_models
                WHERE id = ?
            ''', (model_id,))
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            return {
                'id': result[0],
                'user_id': result[1],
                'name': result[2],
                'profile': json.loads(result[3]) if result[3] else {},
                'created_at': result[4],
                'updated_at': result[5]
            }
        return None

    def get_system_scrolls(self) -> List[Dict]:
        """获取所有系统预设书卷"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM scrolls WHERE scroll_type = 'system'")
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_user_scrolls(self, user_id: int) -> List[Dict]:
        """获取用户自己创建的书卷列表"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM scrolls WHERE user_id = ? AND scroll_type = 'user'", (user_id,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

# 全局数据库实例
db = Database()

