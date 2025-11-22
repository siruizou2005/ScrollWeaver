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
            preset_files = [f for f in os.listdir(presets_dir) if f.endswith('.json')]
            
            preset_names = {
                'example_free.json': '自由模式示例',
                'example_script.json': '剧本模式示例',
                'experiment_alice.json': '爱丽丝梦游仙境',
                'experiment_icefire_bloody_wedding.json': '冰与火之歌：血色婚礼',
                'experiment_icefire.json': '冰与火之歌',
                'experiment_red_mansions.json': '红楼梦',
                'experiment_three_kindoms.json': '三国演义'
            }
            
            for preset_file in preset_files:
                preset_name = preset_names.get(preset_file, preset_file.replace('.json', '').replace('experiment_', '').replace('_', ' '))
                preset_path = os.path.join(presets_dir, preset_file)
                
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

# 全局数据库实例
db = Database()

