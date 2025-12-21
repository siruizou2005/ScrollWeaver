import sys
import os

# 将项目根目录添加到路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from modules.utils.map_manager import MapDataManager

if __name__ == "__main__":
    print("Starting map data migration...")
    try:
        MapDataManager.migrate_all()
        print("Migration completed successfully!")
    except Exception as e:
        print(f"Migration failed: {e}")
        import traceback
        traceback.print_exc()

