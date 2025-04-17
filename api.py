import flask_cors
from flask import request, jsonify
from sqlalchemy import create_engine, text

from runx import DataSource, db, SyncTask, scheduler, sync_executor, app, SyncLog
from db_syncer.utils.engine import parse_cron
from cron import PausableScheduler

flask_cors.CORS(app)
self_scheduler = PausableScheduler()


# ========== API接口 ==========
@app.route('/api/datasources', methods=['POST'])
def manage_datasource():
    """配置管理接口"""
    data = request.json
    print("Received data:", request.json)
    new_ds = DataSource(
        name=data['name'],
        db_type=data['db_type'],
        host=data['host'],
        port=data['port'],
        username=data['username'],
        password=data['password'],
        database=data['database'],
        driver=data['driver']
    )
    db.session.add(new_ds)
    db.session.commit()
    return jsonify({"id": new_ds.id}), 201


@app.route('/api/datasources', methods=['GET'])
def get_datasources():
    """获取所有数据源"""
    page = request.args.get('page', default=1, type=int)
    page_size = request.args.get('pageSize', default=10, type=int)
    db_type = request.args.get('dbType', default=None, type=str)
    name = request.args.get('name', default=None, type=str)

    # 构建查询
    query = DataSource.query

    # 添加数据源类型筛选
    if db_type:
        query = query.filter(DataSource.db_type == db_type)

    # 添加名称模糊查询
    if name:
        query = query.filter(DataSource.name.like(f'%{name}%'))

    # 计算分页信息
    total_datasources = query.count()
    total_pages = (total_datasources + page_size - 1) // page_size

    # 获取分页数据
    datasources = query.paginate(page=page, per_page=page_size, error_out=False).items

    return jsonify({
        'datasources': [{
            'id': ds.id,
            'name': ds.name,
            'db_type': ds.db_type,
            'host': ds.host,
            'port': ds.port,
            'username': ds.username,
            'database': ds.database,
            'driver': ds.driver,
            'created_at': ds.created_at.isoformat()
        } for ds in datasources],
        'totalPages': total_pages,
        'currentPage': page,
        'totalDatasources': total_datasources
    })


@app.route('/api/datasources/<int:ds_id>', methods=['GET'])
def get_datasource(ds_id):
    """获取单个数据源详情"""
    ds = DataSource.query.get_or_404(ds_id)
    return jsonify({
        'id': ds.id,
        'name': ds.name,
        'db_type': ds.db_type,
        'host': ds.host,
        'port': ds.port,
        'username': ds.username,
        'database': ds.database,
        'driver': ds.driver,
        'created_at': ds.created_at.isoformat()
    })


@app.route('/api/datasources/<int:ds_id>', methods=['PUT'])
def update_datasource(ds_id):
    """更新数据源配置"""
    ds = DataSource.query.get_or_404(ds_id)
    data = request.json

    # 更新可修改字段
    if 'name' in data:
        ds.name = data['name']
    if 'host' in data:
        ds.host = data['host']
    if 'port' in data:
        ds.port = data['port']
    if 'username' in data:
        ds.username = data['username']
    if 'password' in data:
        ds.password = data['password']
    if 'database' in data:
        ds.database = data['database']
    if 'driver' in data:
        ds.driver = data['driver']

    db.session.commit()
    return jsonify({'message': 'Data source updated successfully'})


@app.route('/api/datasources/<int:ds_id>', methods=['DELETE'])
def delete_datasource(ds_id):
    """删除数据源"""
    ds = DataSource.query.get_or_404(ds_id)

    # 检查是否有任务依赖此数据源
    dependent_tasks = SyncTask.query.filter(
        (SyncTask.source_id == ds_id) | (SyncTask.target_id == ds_id)
    ).count()

    if dependent_tasks > 0:
        return jsonify({
            'error': f'Cannot delete data source. There are {dependent_tasks} tasks depending on it.'
        }), 400

    db.session.delete(ds)
    db.session.commit()
    return jsonify({'message': 'Data source deleted successfully'})


@app.route('/api/tasks', methods=['POST'])
def schedule_task():
    try:
        """任务调度接口"""
        data = request.json
        print("Received task data:", data)  # 确保打印日志
        new_task = SyncTask(
            name=data['name'],
            cron=data['cron'],
            source_id=data['source_id'],
            source_table=data['source_table'],
            target_id=data['target_id'],
            target_table=data['target_table'],
            column_map=data['column_map'],
            filter_rule=data.get('filter_rule', '1=1')
        )
        db.session.add(new_task)
        db.session.commit()
        print(f"New task ID: {new_task.id}")  # 确保打印日志

        # 确保调度器已初始化
        if not hasattr(self_scheduler, 'add_job'):
            raise Exception("Scheduler is not properly initialized")

        # 添加任务到调度器
        self_scheduler.add_job(
            sync_executor,
            new_task.id,
            'cron',
            **parse_cron(data['cron'])
        )
        print(f"Task {new_task.id} added to scheduler")  # 确保打印日志

        return jsonify({"task_id": new_task.id}), 201
    except Exception as e:
        print(f"Error in schedule_task: {e}")  # 确保打印日志
        return jsonify({"error": str(e)}), 500


@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    """获取所有同步任务"""
    tasks = SyncTask.query.all()
    task_list = []
    for task in tasks:
        task_dict = {
            'id': task.id,
            'name': task.name,
            'cron': task.cron,
            'source_id': task.source_id,
            'target_id': task.target_id,
            'column_map': task.column_map,
            'filter_rule': task.filter_rule,
            'source_table': task.source_table,
            'target_table': task.target_table,
            'last_run': task.last_run.isoformat() if task.last_run else None,
            'status': self_scheduler.get_job_status(task.id)  # 获取任务状态
        }
        task_list.append(task_dict)
    return jsonify(task_list)


@app.route('/api/tasks/<int:task_id>', methods=['GET'])
def get_task(task_id):
    """获取单个任务详情"""
    task = SyncTask.query.get_or_404(task_id)
    return jsonify({
        'id': task.id,
        'name': task.name,
        'cron': task.cron,
        'source_id': task.source_id,
        'target_id': task.target_id,
        'column_map': task.column_map,
        'filter_rule': task.filter_rule,
        'source_table': task.source_table,
        'target_table': task.target_table,
        'last_run': task.last_run.isoformat() if task.last_run else None
    })


@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    """更新同步任务"""
    task = SyncTask.query.get_or_404(task_id)
    data = request.json

    try:
        # 先移除旧的定时任务
        self_scheduler.remove_job(task_id)
    except Exception as e:
        pass
    # 更新任务信息

    if 'name' in data:
        task.name = data['name']
    if 'cron' in data:
        task.cron = data['cron']
    if 'source_id' in data:
        task.source_id = data['source_id']
    if 'target_id' in data:
        task.target_id = data['target_id']
    if 'column_map' in data:
        task.column_map = data['column_map']
    if 'filter_rule' in data:
        task.filter_rule = data['filter_rule']
    if 'source_table' in data:
        task.source_table = data['source_table']
    if 'target_table' in data:
        task.target_table = data['target_table']

    # 重新添加定时任务
    if 'cron' in data:
        self_scheduler.add_job(
            sync_executor,
            task_id,
            'cron',
            **parse_cron(data['cron'])
        )

        db.session.commit()
        return jsonify({'message': 'Task updated successfully'})


@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    """删除同步任务"""
    task = SyncTask.query.get_or_404(task_id)

    # 移除定时任务
    self_scheduler.remove_job(task_id)

    db.session.delete(task)
    db.session.commit()
    return jsonify({'message': 'Task deleted successfully'})


@app.route('/api/tasks/<int:task_id>/run', methods=['POST'])
def run_task(task_id):
    """立即执行任务"""
    task = SyncTask.query.get_or_404(task_id)
    sync_executor(task.id)
    return jsonify({'message': 'Task executed successfully'})


@app.route('/api/tasks/<int:task_id>/pause', methods=['POST'])
def pause_task(task_id):
    """暂停任务"""
    try:
        self_scheduler.pause_job(task_id)
        return jsonify({'message': 'Task paused successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/tasks/<int:task_id>/resume', methods=['POST'])
def resume_task(task_id):
    """恢复任务"""
    try:
        self_scheduler.resume_job(task_id)
        return jsonify({'message': 'Task resumed successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


# 在原有代码中添加以下内容

@app.route('/api/datasources/test', methods=['POST'])
def test_datasource_connection():
    """测试数据源连接"""
    data = request.json

    try:
        # 根据不同类型创建测试连接
        if data['db_type'] == 'mysql':
            engine = create_engine(
                f"mysql+{data.get('driver', 'pymysql')}://{data['username']}:{data['password']}@{data['host']}:{data['port']}/{data['database']}",
                connect_args={'connect_timeout': 5}
            )
        elif data['db_type'] == 'sqlserver':
            engine = create_engine(
                f"mssql+pyodbc://{data['username']}:{data['password']}@{data['host']}:{data['port']}/{data['database']}?"
                "driver=ODBC+Driver+17+for+SQL+Server",
                connect_args={'connect_timeout': 5}
            )
        else:
            return jsonify({"success": False, "message": "不支持的数据库类型"}), 400

        # 测试连接
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        return jsonify({"success": True, "message": "连接测试成功"})

    except Exception as e:
        return jsonify({"success": False, "message": f"连接失败: {str(e)}"}), 400


@app.route('/api/logs', methods=['GET'])
def get_logs():
    """获取所有日志"""
    page = request.args.get('page', default=1, type=int)
    page_size = request.args.get('pageSize', default=10, type=int)
    task_name = request.args.get('taskName', default=None, type=str)
    task_status = request.args.get('taskStatus', default=None, type=str)

    # 添加排序功能，按时间倒序
    logs_query = SyncLog.query.order_by(SyncLog.start_time.desc())

    # 定义查询策略
    def query_by_name_and_status(logs_query, task_name, task_status):
        if task_name and task_status:
            # 先根据任务名称模糊查询任务ID
            task_ids = [task.id for task in SyncTask.query.filter(SyncTask.name.like(f'%{task_name}%')).all()]
            if task_ids:
                return logs_query.filter(SyncLog.task_id.in_(task_ids), SyncLog.status == task_status)
            else:
                return logs_query.filter(SyncLog.status == task_status)
        elif task_name:
            task_ids = [task.id for task in SyncTask.query.filter(SyncTask.name.like(f'%{task_name}%')).all()]
            if task_ids:
                return logs_query.filter(SyncLog.task_id.in_(task_ids))
            else:
                return logs_query.filter(False)  # 如果没有匹配的任务，直接返回空结果
        elif task_status:
            return logs_query.filter(SyncLog.status == task_status)
        else:
            return logs_query

    # 应用查询策略
    logs_query = query_by_name_and_status(logs_query, task_name, task_status)

    # 计算分页信息
    total_logs = logs_query.count()
    total_pages = (total_logs + page_size - 1) // page_size

    # 获取分页数据
    logs = logs_query.paginate(page=page, per_page=page_size, error_out=False).items

    log_list = []
    for log in logs:
        task = SyncTask.query.get(log.task_id)
        log_dict = {
            'id': log.id,
            'task_id': log.task_id,
            'task_name': task.name if task else '未知任务',
            'start_time': log.start_time.isoformat() if log.start_time else None,
            'end_time': log.end_time.isoformat() if log.end_time else None,
            'status': log.status,
            'details': log.details,
            'execution_time': log.execution_time,
            'records_processed': log.records_processed,
            'error_message': log.error_message
        }
        log_list.append(log_dict)

    return jsonify({
        'logs': log_list,
        'totalPages': total_pages,
        'currentPage': page,
        'totalLogs': total_logs
    })


@app.route('/api/logs/<int:log_id>', methods=['GET'])
def get_log(log_id):
    """获取单个日志详情"""
    log = SyncLog.query.get_or_404(log_id)
    task = SyncTask.query.get(log.task_id)
    return jsonify({
        'id': log.id,
        'task_id': log.task_id,
        'task_name': task.name if task else '未知任务',
        'start_time': log.start_time.isoformat() if log.start_time else None,
        'end_time': log.end_time.isoformat() if log.end_time else None,
        'status': log.status,
        'details': log.details,
        'execution_time': log.execution_time,
        'records_processed': log.records_processed,
        'error_message': log.error_message
    })


@app.route('/api/logs', methods=['POST'])
def create_log():
    """创建日志"""
    data = request.json
    new_log = SyncLog(
        task_id=data['task_id'],
        start_time=data.get('start_time'),
        end_time=data.get('end_time'),
        status=data['status'],
        sql_statements=data.get('sql_statements'),
        record_count=data.get('record_count'),
        error_message=data.get('error_message')
    )
    db.session.add(new_log)
    db.session.commit()
    return jsonify({"id": new_log.id}), 201


@app.route('/api/logs/<int:log_id>', methods=['PUT'])
def update_log(log_id):
    """更新日志"""
    log = SyncLog.query.get_or_404(log_id)
    data = request.json

    if 'task_id' in data:
        log.task_id = data['task_id']
    if 'start_time' in data:
        log.start_time = data['start_time']
    if 'end_time' in data:
        log.end_time = data['end_time']
    if 'status' in data:
        log.status = data['status']
    if 'sql_statements' in data:
        log.sql_statements = data['sql_statements']
    if 'record_count' in data:
        log.record_count = data['record_count']
    if 'error_message' in data:
        log.error_message = data['error_message']

    db.session.commit()
    return jsonify({'message': 'Log updated successfully'})


@app.route('/api/logs/<int:log_id>', methods=['DELETE'])
def delete_log(log_id):
    """删除日志"""
    log = SyncLog.query.get_or_404(log_id)
    db.session.delete(log)
    db.session.commit()
    return jsonify({'message': 'Log deleted successfully'})


# ========== 初始化 ==========
# def initialize():
#     with app.app_context():
#         db.create_all()
#         scheduler.start()


if __name__ == '__main__':
    # initialize()
    app.run(host='0.0.0.0', port=5000)
