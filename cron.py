import logging

import redis
from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.jobstores.redis import RedisJobStore
from apscheduler.schedulers.background import BackgroundScheduler
from runx import app

# 设置日志
logging.basicConfig()
logging.getLogger('apscheduler').setLevel(logging.DEBUG)

# Redis配置
REDIS_HOST = '192.168.56.100'
REDIS_PORT = 6379
REDIS_DB = 2
REDIS_PASSWORD = None

# 初始化Redis连接
r = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=REDIS_DB,
    password=REDIS_PASSWORD
)

# 任务状态键前缀
TASK_STATUS_PREFIX = "task_status:"


# 包装任务函数，检查状态后再执行
def wrapped_func(job_id, func):
    status = r.get(f"{TASK_STATUS_PREFIX}{job_id}")
    if status and status.decode('utf-8') == 'running':
        with app.app_context():
            func(job_id)


class PausableScheduler:
    def __init__(self):
        # 配置调度器
        jobstores = {
            'default': RedisJobStore(
                host=REDIS_HOST,
                port=REDIS_PORT,
                db=REDIS_DB,
                password=REDIS_PASSWORD
            )
        }
        executors = {
            'default': ThreadPoolExecutor(20)
        }

        self.scheduler = BackgroundScheduler(jobstores=jobstores, executors=executors)
        self.scheduler.start()
        print(f"初始化完成: {jobstores}")

    def add_job(self, func, job_id, trigger, **trigger_args):
        """添加任务"""
        # 初始状态设为运行中
        r.set(f"{TASK_STATUS_PREFIX}{job_id}", "running")

        self.scheduler.add_job(
            wrapped_func,
            trigger,
            args=[job_id, func],
            id=str(job_id),
            **trigger_args
        )
        print(f"Job {job_id} added")

    def pause_job(self, job_id):
        """暂停任务"""
        r.set(f"{TASK_STATUS_PREFIX}{job_id}", "paused")
        self.scheduler.pause_job(job_id)
        print(f"Job {job_id} paused")

    def resume_job(self, job_id):
        """恢复任务"""
        r.set(f"{TASK_STATUS_PREFIX}{job_id}", "running")
        self.scheduler.resume_job(job_id)
        print(f"Job {job_id} resumed")

    def remove_job(self, job_id):
        """删除任务"""
        self.scheduler.remove_job(job_id)
        r.delete(f"{TASK_STATUS_PREFIX}{job_id}")
        print(f"Job {job_id} removed")

    def get_job_status(self, job_id):
        """获取任务状态"""
        status = r.get(f"{TASK_STATUS_PREFIX}{job_id}")
        return status.decode('utf-8') if status else None
