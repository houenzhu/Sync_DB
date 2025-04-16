# ========== 同步引擎 ==========
from sqlalchemy import create_engine


def get_engine(config):
    """动态创建数据库引擎"""
    if config.db_type == 'mysql':
        return create_engine(
            f"mysql+{config.driver}://{config.username}:{config.password}@{config.host}:{config.port}/{config.database}"
        )
    elif config.db_type == 'sqlserver':
        return create_engine(
            f"mssql+pyodbc://{config.username}:{config.password}@{config.host}:{config.port}/{config.database}?driver=ODBC+Driver+17+for+SQL+Server"
        )


def parse_cron(cron_str):
    """将cron表达式解析为APScheduler参数"""
    parts = cron_str.split()
    if len(parts) != 5:
        raise ValueError("Invalid cron expression")

    return {
        'minute': parts[0],
        'hour': parts[1],
        'day': parts[2],
        'month': parts[3],
        'day_of_week': parts[4]
    }
