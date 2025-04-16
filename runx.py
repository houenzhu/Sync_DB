from flask_sqlalchemy import SQLAlchemy
from flask import Flask, current_app
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import text, Table, MetaData
from datetime import datetime
from utils.engine import get_engine

app = Flask(__name__)

# ========== 初始化 ==========
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///data.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
scheduler = BackgroundScheduler()


# ========== 数据模型 ==========
class DataSource(db.Model):
    """连接配置表"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True)
    db_type = db.Column(db.String(20))  # mysql/sqlserver
    host = db.Column(db.String(120))
    port = db.Column(db.Integer)
    username = db.Column(db.String(50))
    password = db.Column(db.String(200))
    database = db.Column(db.String(50))
    driver = db.Column(db.String(50))  # 驱动类型
    created_at = db.Column(db.DateTime, default=datetime.now)


class SyncTask(db.Model):
    """同步任务表"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80))
    cron = db.Column(db.String(50))  # cron表达式
    source_id = db.Column(db.Integer)
    target_id = db.Column(db.Integer)
    source_table = db.Column(db.String(50))
    target_table = db.Column(db.String(50))
    column_map = db.Column(db.JSON)
    filter_rule = db.Column(db.String(500))
    last_run = db.Column(db.DateTime)
    last_status = db.Column(db.String(200))
    execution_time = db.Column(db.Float)


class SyncLog(db.Model):
    """同步日志表"""
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('sync_task.id'))
    start_time = db.Column(db.DateTime)
    end_time = db.Column(db.DateTime)
    status = db.Column(db.String(20))  # running/success/failed
    execution_time = db.Column(db.Float)  # 执行耗时(秒)
    records_processed = db.Column(db.Integer)  # 处理的记录数
    error_message = db.Column(db.Text)  # 错误信息
    details = db.Column(db.Text)  # 详细执行信息

    # 定义关系
    task = db.relationship('SyncTask', backref='logs')


# 初始化数据库
with app.app_context():
    db.create_all()


def sync_executor(task_id):
    """执行同步逻辑（带详细日志记录）"""
    with current_app.app_context():
        # 初始化时间变量
        process_start = datetime.now()
        log_start = datetime.now()
        records_processed = 0

        # 创建初始日志记录
        log = SyncLog(
            task_id=task_id,
            start_time=log_start,
            status='running',
            details='任务开始执行'
        )
        db.session.add(log)
        db.session.commit()

        try:
            # 获取任务信息
            task = SyncTask.query.get(task_id)
            if not task:
                raise ValueError(f"任务 {task_id} 不存在")

            log.details = f"获取任务信息成功: {task.name}"
            db.session.commit()

            # 获取数据源信息
            source = DataSource.query.get(task.source_id)
            target = DataSource.query.get(task.target_id)
            if not source or not target:
                raise ValueError("源数据库或目标数据库配置不存在")

            log.details += f"\n获取数据源信息成功 - 源: {source.name}, 目标: {target.name}"
            db.session.commit()

            # 记录处理开始时间
            process_start = datetime.now()
            records_processed = 0

            # 使用上下文管理器管理连接
            with get_engine(source).connect() as src_conn, \
                    get_engine(target).begin() as tgt_conn:

                log.details += "\n数据库连接建立成功"
                db.session.commit()

                # 1. 构建并执行源查询
                source_columns = list(task.column_map.keys())
                query = text(
                    f"SELECT {','.join(source_columns)} FROM {task.source_table} "
                    f"WHERE 1=1 {task.filter_rule or ''}"
                )

                log.details += f"\n构建查询SQL: {query}"
                db.session.commit()

                # 2. 批量获取数据
                result = src_conn.execution_options(stream_results=True).execute(query)

                log.details += "\n源数据查询执行成功"
                db.session.commit()

                # 3. 准备目标表信息
                metadata = MetaData()
                target_table = Table(task.target_table, metadata, autoload_with=tgt_conn.engine)

                # 清空目标表
                tgt_conn.execute(target_table.delete())
                log.details += f"\n目标表 {task.target_table} 已清空"
                db.session.commit()

                # 4. 批量插入数据
                batch_size = 2000
                batch = []
                insert_stmt = target_table.insert()

                log.details += f"\n开始处理数据，批次大小: {batch_size}"
                db.session.commit()

                for row in result:
                    row_dict = dict(zip(source_columns, row))
                    records_processed += 1

                    filtered_row = {
                        target_col: row_dict[source_col]
                        for source_col, target_col in task.column_map.items()
                    }
                    batch.append(filtered_row)

                    if len(batch) >= batch_size:
                        tgt_conn.execute(insert_stmt, batch)
                        batch = []
                        log.details += f"\n已处理 {records_processed} 条记录"
                        db.session.commit()

                # 插入剩余数据
                if batch:
                    tgt_conn.execute(insert_stmt, batch)
                    log.details += f"\n最后批次插入 {len(batch)} 条记录"
                    db.session.commit()

                # 计算执行时间
                process_end = datetime.now()
                execution_time = (process_end - process_start).total_seconds()

                # 更新日志记录
                log.end_time = process_end
                log.status = 'success'
                log.execution_time = execution_time
                log.records_processed = records_processed
                log.details += f"\n任务执行成功，共处理 {records_processed} 条记录，耗时 {execution_time:.2f} 秒"

                # 更新任务状态
                task.last_run = process_end
                task.last_status = "success"
                task.execution_time = execution_time

                db.session.commit()
                return True

        except Exception as e:
            # 错误处理
            db.session.rollback()

            # 计算已执行时间
            error_time = datetime.now()
            execution_time = (error_time - process_start).total_seconds()

            # 更新日志记录
            log.end_time = error_time
            log.status = 'failed'
            log.execution_time = execution_time
            log.records_processed = records_processed
            log.error_message = str(e)
            log.details += f"\n任务执行失败: {str(e)}"

            # 更新任务状态
            task.last_run = error_time
            task.last_status = f"failed: {str(e)}"

            db.session.commit()
            raise
