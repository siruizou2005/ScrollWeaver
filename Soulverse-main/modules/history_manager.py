from typing import Any, Dict, List, Optional, Literal
from collections import defaultdict
from datetime import datetime
from sw_utils import load_json_file, save_json_file, load_jsonl_file, save_jsonl_file
import os


class HistoryManager:
    def __init__(self):
        self.detailed_history = []

    def add_record(self, record):
        """添加一个事件记录
        record = {
            "cur_round":cur_round,
            "role_code":role_code,
            "detail":detail,
            "type":act_type,
            "initiator":initiator,
            "actor":actor
            "group":group,
            "other_info":other_info,
            "record_id":record_id
        }
        """
        self.detailed_history.append(record)

    def modify_record(self, record_id: str, detail: str):
        """修改特定记录"""
        for record in self.detailed_history:
            if record["record_id"] == record_id:
                record["detail"] = detail
                print(f"Record {record_id} has been modified.")
                return record['group']
    
    def search_record_detail(self, record_id: str):
        for record in self.detailed_history[::-1]:
            if record["record_id"] == record_id:
                return record["detail"]
        return None
    
    def get_recent_history(self, recent_k = 5, include_speaker = False, performers = None):
        """
        获取最近的历史记录
        
        Args:
            recent_k: 最近k条记录
            include_speaker: 是否包含说话者信息
            performers: 如果include_speaker=True，需要提供performers字典来获取角色名称
        """
        if include_speaker and performers:
            result = []
            for record in self.detailed_history[-recent_k:]:
                role_code = record.get("role_code", "")
                detail = record.get("detail", "")
                if role_code and role_code in performers:
                    # 优先使用nickname，如果没有则使用role_name
                    performer = performers[role_code]
                    if hasattr(performer, 'nickname') and performer.nickname:
                        role_name = performer.nickname
                    elif hasattr(performer, 'role_name'):
                        role_name = performer.role_name
                    else:
                        role_name = role_code
                    result.append(f"{role_name}: {detail}")
                else:
                    # 如果没有找到performer，仍然显示detail（可能是系统消息等）
                    result.append(detail)
            return result
        else:
            return [record["detail"] for record in self.detailed_history[-recent_k:]]
    
    def get_subsequent_history(self,start_idx):
        return [record["detail"] for record in self.detailed_history[start_idx:]]
    
    def get_complete_history(self,):
        return [record["detail"] for record in self.detailed_history[:]]
    
    def __len__(self):
        return len(self.detailed_history)
    
    def __getstate__(self):
        states = {key: value for key, value in self.__dict__.items() \
            if isinstance(value, (str, int, list, dict, bool, type(None)))}
        return states

    def __setstate__(self, states):
        self.__dict__.update(states)

    def save_to_file(self, root_dir):
        filename = os.path.join(root_dir, f"./simulation_history.json")
        save_json_file(filename, self.__getstate__() )

    def load_from_file(self, root_dir):
        filename = os.path.join(root_dir, f"./simulation_history.json")
        states = load_json_file(filename)
        self.__setstate__(states)     


