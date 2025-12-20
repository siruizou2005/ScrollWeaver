"""
时间加速模拟系统
实现虚拟时间流（1虚拟小时 = 1实际分钟）
"""
from datetime import datetime, timedelta
from typing import Optional
import time


class TimeSimulator:
    """
    时间模拟器
    支持虚拟时间加速，记录虚拟时间戳
    """
    
    def __init__(self, 
                 time_ratio: float = 60.0,
                 start_virtual_time: Optional[datetime] = None):
        """
        初始化时间模拟器
        
        Args:
            time_ratio: 时间加速比例（1实际秒 = time_ratio虚拟秒）
                       默认60.0表示1实际分钟 = 1虚拟小时
            start_virtual_time: 虚拟起始时间（如果为None，使用当前时间）
        """
        self.time_ratio = time_ratio
        self.start_real_time = datetime.now()
        self.start_virtual_time = start_virtual_time or self.start_real_time
        self.is_paused = False
        self.pause_start_time: Optional[datetime] = None
        self.paused_duration = timedelta(0)  # 累计暂停时间
    
    def get_virtual_time(self) -> datetime:
        """
        获取当前虚拟时间
        
        Returns:
            当前虚拟时间
        """
        if self.is_paused:
            # 如果暂停，返回暂停时的虚拟时间
            return self._calculate_virtual_time(self.pause_start_time)
        
        return self._calculate_virtual_time(datetime.now())
    
    def _calculate_virtual_time(self, real_time: datetime) -> datetime:
        """
        计算给定实际时间对应的虚拟时间
        
        Args:
            real_time: 实际时间
        
        Returns:
            虚拟时间
        """
        # 计算实际经过的时间（减去暂停时间）
        elapsed_real = real_time - self.start_real_time - self.paused_duration
        
        # 转换为虚拟时间
        elapsed_virtual = timedelta(seconds=elapsed_real.total_seconds() * self.time_ratio)
        
        return self.start_virtual_time + elapsed_virtual
    
    def pause(self):
        """暂停时间流"""
        if not self.is_paused:
            self.is_paused = True
            self.pause_start_time = datetime.now()
    
    def resume(self):
        """恢复时间流"""
        if self.is_paused:
            pause_end = datetime.now()
            pause_duration = pause_end - self.pause_start_time
            self.paused_duration += pause_duration
            self.is_paused = False
            self.pause_start_time = None
    
    def reset(self, new_start_virtual_time: Optional[datetime] = None):
        """
        重置时间模拟器
        
        Args:
            new_start_virtual_time: 新的虚拟起始时间（如果为None，使用当前时间）
        """
        self.start_real_time = datetime.now()
        self.start_virtual_time = new_start_virtual_time or datetime.now()
        self.is_paused = False
        self.pause_start_time = None
        self.paused_duration = timedelta(0)
    
    def set_time_ratio(self, ratio: float):
        """
        设置时间加速比例
        
        Args:
            ratio: 新的时间比例
        """
        # 记录当前虚拟时间
        current_virtual = self.get_virtual_time()
        
        # 更新比例
        self.time_ratio = ratio
        
        # 重置起始时间以保持虚拟时间连续性
        self.start_real_time = datetime.now()
        self.start_virtual_time = current_virtual
        self.paused_duration = timedelta(0)
    
    def get_time_info(self) -> dict:
        """
        获取时间信息
        
        Returns:
            包含时间信息的字典
        """
        return {
            "virtual_time": self.get_virtual_time().strftime("%Y-%m-%d %H:%M:%S"),
            "real_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "time_ratio": self.time_ratio,
            "is_paused": self.is_paused,
            "virtual_hours_passed": (self.get_virtual_time() - self.start_virtual_time).total_seconds() / 3600
        }
    
    def format_virtual_time(self, format_str: str = "%Y-%m-%d %H:%M:%S") -> str:
        """
        格式化虚拟时间字符串
        
        Args:
            format_str: 时间格式字符串
        
        Returns:
            格式化的虚拟时间字符串
        """
        return self.get_virtual_time().strftime(format_str)
    
    def get_virtual_timestamp(self) -> float:
        """
        获取虚拟时间戳（Unix timestamp）
        
        Returns:
            虚拟时间戳
        """
        return self.get_virtual_time().timestamp()
    
    def advance_virtual_time(self, virtual_duration: timedelta):
        """
        手动推进虚拟时间（用于测试或特殊场景）
        
        Args:
            virtual_duration: 要推进的虚拟时间长度
        """
        self.start_virtual_time += virtual_duration


# 全局时间模拟器实例（可以在ScrollWeaver中使用）
_global_time_simulator: Optional[TimeSimulator] = None


def get_time_simulator(time_ratio: float = 60.0) -> TimeSimulator:
    """
    获取全局时间模拟器实例
    
    Args:
        time_ratio: 时间加速比例（仅在首次创建时使用）
    
    Returns:
        时间模拟器实例
    """
    global _global_time_simulator
    if _global_time_simulator is None:
        _global_time_simulator = TimeSimulator(time_ratio=time_ratio)
    return _global_time_simulator


def reset_time_simulator(time_ratio: float = 60.0, start_virtual_time: Optional[datetime] = None):
    """
    重置全局时间模拟器
    
    Args:
        time_ratio: 时间加速比例
        start_virtual_time: 虚拟起始时间
    """
    global _global_time_simulator
    _global_time_simulator = TimeSimulator(time_ratio=time_ratio, start_virtual_time=start_virtual_time)

