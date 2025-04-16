<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
const URL = "http://127.0.0.1:5000";
    let globalTasks = [];
    $(document).ready(function () {
        // 全局变量
        let currentPage = 'dashboard';

        // 初始化页面
        initDashboard();

        // 导航菜单点击事件
        $('.sidebar-menu a').click(function (e) {
            e.preventDefault();
            const page = $(this).data('page');

            if (page !== currentPage) {
                // 更新活动菜单项
                $('.sidebar-menu a').removeClass('active');
                $(this).addClass('active');

                // 隐藏所有页面
                $('.page').hide();

                // 显示选中的页面
                $(`#${page}-page`).show();
                currentPage = page;

                // 初始化页面数据
                if (page === 'datasources') {
                    loadDatasources();
                } else if (page === 'tasks') {
                    loadTasks();
                } else if (page === 'logs') {
                    loadLogs();
                } else if (page === 'dashboard') {
                    initDashboard();
                }
            }
        });

        // 数据源管理相关事件
        $('#add-datasource-btn').click(function () {
            showDatasourceModal();
        });

        // 任务管理相关事件
        $('#add-task-btn').click(function () {
            showTaskModal();
        });

        // 模态框关闭事件
        $('.close, .modal').click(function (e) {
            if ($(e.target).hasClass('modal') || $(e.target).hasClass('close')) {
                $('.modal').hide();
            }
        });

        // 阻止模态框内容点击事件冒泡
        $('.modal-content').click(function (e) {
            e.stopPropagation();
        });

        // 测试数据库连接
        $('#test-connection-btn').click(function () {
            testDatasourceConnection();
        });

        // 数据源表单提交
        $('#datasource-form').submit(function (e) {
            e.preventDefault();
            saveDatasource();
        });

        // 任务表单提交
        $('#task-form').submit(function (e) {
            e.preventDefault();
            saveTask();
        });

        // 设置表单提交
        $('#settings-form').submit(function (e) {
            e.preventDefault();
            saveSettings();
        });

        // 关闭日志详情
        $('#close-log-detail').click(function () {
            $('#log-detail-modal').hide();
        });

        // 初始化仪表盘
        function initDashboard() {
            $.get(URL + '/api/datasources', function (data) {
                $('#total-datasources').text(data.length);
            });

            $.get(URL + '/api/tasks', function (data) {
                $('#total-tasks').text(data.length);

                // 显示最近5个任务
                const recentTasks = data.slice(0, 5);
                let html = '';

                recentTasks.forEach(task => {
                    html += `
                            <tr>
                                <td>${task.name}</td>
                                <td>${new Date(task.last_run).toLocaleString()}</td>
                                <td><span class="badge badge-primary">成功</span></td>
                                <td>
                                    <button class="btn btn-sm" onclick="runTask(${task.id})">执行</button>
                                </td>
                            </tr>
                        `;
                });

                $('#recent-tasks-list').html(html);
            });

            // 模拟今日执行次数
            $('#today-runs').text(Math.floor(Math.random() * 10) + 1);
        }

        // 加载数据源列表
        function loadDatasources() {
            $.get(URL + '/api/datasources', function (data) {
                let html = '';

                data.forEach(ds => {
                    html += `
                            <tr>
                                <td>${ds.name}</td>
                                <td><span class="badge">${ds.db_type}</span></td>
                                <td>${ds.host}:${ds.port}</td>
                                <td>${ds.database}</td>
                                <td>${new Date(ds.created_at).toLocaleDateString()}</td>
                                <td>
                                    <button class="btn btn-sm" onclick="editDatasource(${ds.id})"><i class="fas fa-edit"></i></button>
                                    <button class="btn btn-sm btn-danger" onclick="deleteDatasource(${ds.id})"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>
                        `;
                });

                $('#datasources-list').html(html);
            }).fail(function () {
                showAlert('#datasource-error-alert', 'danger', '加载数据源列表失败');
            });
        }

        // 加载任务列表
        function loadTasks() {
            $.get(URL + '/api/tasks', function (tasks) {
                // 先获取所有数据源用于显示名称
                $.get(URL + '/api/datasources', function (datasources) {
                    let html = '';
                    globalTasks = tasks;
                    tasks.forEach(task => {
                        const source = datasources.find(ds => ds.id === task.source_id);
                        const target = datasources.find(ds => ds.id === task.target_id);

                        // 根据任务状态设置图标和按钮状态
                        const isPaused = task.status === 'paused';
                        const pauseBtnIcon = isPaused ? 'fa-play' : 'fa-pause';
                        const pauseBtnText = isPaused ? '恢复' : '暂停';

                        html += `
                            <tr>
                                <td>${task.name}</td>
                                <td>${task.cron}</td>
                                <td>${source ? source.name : '未知'}</td>
                                <td>${target ? target.name : '未知'}</td>
                                <td>${task.last_run ? new Date(task.last_run).toLocaleString() : '从未执行'}</td>
                                <td>
                                    <button class="btn btn-sm" onclick="runTask(${task.id})"><i class="fas fa-play"></i></button>
                                    <button class="btn btn-sm" id="pause-btn-${task.id}" onclick="togglePauseTask(${task.id})">
                                        <i class="fas ${pauseBtnIcon}"></i> ${pauseBtnText}
                                    </button>
                                    <button class="btn btn-sm" onclick="editTask(${task.id})"><i class="fas fa-edit"></i></button>
                                    <button class="btn btn-sm btn-danger" onclick="deleteTask(${task.id})"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>
                        `;
                    });

                    $('#tasks-list').html(html);
                });
            }).fail(function () {
                showAlert('#task-error-alert', 'danger', '加载任务列表失败');
            });
        }

        // 加载执行日志
        window.loadLogs = function (page = 1, pageSize = 10) {
            $.get(URL + '/api/logs', {page, pageSize}, function (response) {
                // 1. 渲染日志表格内容
                let html = '';
                response.logs.forEach(log => {
                    const duration = log.end_time ?
                        ((new Date(log.end_time) - new Date(log.start_time)) / 1000) : 0;
                    const statusBadge = log.status === 'success' ?
                        '<span class="badge badge-primary">成功</span>' :
                        '<span class="badge badge-danger">失败</span>';

                    html += `
                <tr>
                    <td>${log.task_name || '未知任务'}</td>
                    <td>${new Date(log.start_time).toLocaleString()}</td>
                    <td>${duration.toFixed(2)}s</td>
                    <td>${statusBadge}</td>
                    <td>${log.records_processed || 0}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="showLogDetail(${log.id})">
                            <i class="fas fa-info-circle"></i> 详情
                        </button>
                    </td>
                </tr>
            `;
                });
                $('#logs-list').html(html);

                // 2. 渲染分页控件
                const totalPages = Math.ceil(response.totalLogs / pageSize);
                let paginationHtml = `
            <div class="pagination-container">
                <div class="pagination-summary">
                    显示 <span class="text-primary">${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, response.totalLogs)}</span>
                    条，共 <span class="text-primary">${response.totalLogs}</span> 条记录
                </div>

                <div class="pagination-controls">
                    <button class="pagination-btn ${page === 1 ? 'disabled' : ''}"
                            onclick="loadLogs(${page - 1}, ${pageSize})" ${page === 1 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-left"></i>
                    </button>

                    <div class="pagination-pages">
        `;

                // 计算页码范围（最多显示7个页码）
                let startPage = Math.max(1, page - 3);
                let endPage = Math.min(totalPages, page + 3);

                if (page <= 4) {
                    endPage = Math.min(7, totalPages);
                } else if (page >= totalPages - 3) {
                    startPage = Math.max(totalPages - 6, 1);
                }

                // 显示第一页和省略号（如果当前页不在前几页）
                if (startPage > 1) {
                    paginationHtml += `
                <button class="pagination-btn ${1 === page ? 'active' : ''}"
                        onclick="loadLogs(1, ${pageSize})">1</button>
                <span class="pagination-ellipsis">...</span>
            `;
                }

                // 显示页码
                for (let i = startPage; i <= endPage; i++) {
                    paginationHtml += `
                <button class="pagination-btn ${i === page ? 'active' : ''}"
                        onclick="loadLogs(${i}, ${pageSize})">${i}</button>
            `;
                }

                // 显示最后一页和省略号（如果当前页不在最后几页）
                if (endPage < totalPages) {
                    paginationHtml += `
                <span class="pagination-ellipsis">...</span>
                <button class="pagination-btn ${totalPages === page ? 'active' : ''}"
                        onclick="loadLogs(${totalPages}, ${pageSize})">${totalPages}</button>
            `;
                }

                paginationHtml += `
                    </div>

                    <button class="pagination-btn ${page === totalPages ? 'disabled' : ''}"
                            onclick="loadLogs(${page + 1}, ${pageSize})" ${page === totalPages ? 'disabled' : ''}>
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>

                <div class="page-size-selector">
                    <span>每页显示</span>
                    <select class="form-control-sm" onchange="loadLogs(1, parseInt(this.value))">
                        <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
                        <option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option>
                        <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
                    </select>
                </div>
            </div>
        `;

                $('#logs-pagination').html(paginationHtml);
            }).fail(function () {
                showAlert('#task-error-alert', 'danger', '加载日志列表失败');
            });
        };

        // 显示数据源模态框
        function showDatasourceModal(id = null) {
            $('#datasource-form')[0].reset();
            $('#datasource-id').val('');

            if (id) {
                $('#datasource-modal-title').text('编辑数据源');

                $.get(`${URL}/api/datasources/${id}`, function (data) {
                    $('#datasource-id').val(data.id);
                    $('#datasource-name').val(data.name);
                    $('#datasource-type').val(data.db_type);
                    $('#datasource-host').val(data.host);
                    $('#datasource-port').val(data.port);
                    $('#datasource-username').val(data.username);
                    $('#datasource-password').val(data.password);
                    $('#datasource-database').val(data.database);
                    $('#datasource-driver').val(data.driver);

                    $('#datasource-modal').show();
                }).fail(function () {
                    showAlert('#datasource-error-alert', 'danger', '加载数据源信息失败');
                });
            } else {
                $('#datasource-modal-title').text('添加数据源');
                $('#datasource-modal').show();
            }
        }

        // 显示任务模态框
        function showTaskModal(id = null) {
            $('#task-form')[0].reset();
            $('#task-id').val('');

            // 加载数据源下拉选项
            $.get(URL + '/api/datasources', function (datasources) {
                let sourceOptions = '<option value="">-- 请选择 --</option>';
                let targetOptions = '<option value="">-- 请选择 --</option>';

                datasources.forEach(ds => {
                    sourceOptions += `<option value="${ds.id}">${ds.name} (${ds.db_type})</option>`;
                    targetOptions += `<option value="${ds.id}">${ds.name} (${ds.db_type})</option>`;
                });

                $('#task-source').html(sourceOptions);
                $('#task-target').html(targetOptions);

                if (id) {
                    $('#task-modal-title').text('编辑同步任务');

                    $.get(`${URL}/api/tasks/${id}`, function (data) {
                        $('#task-id').val(data.id);
                        $('#task-name').val(data.name);
                        $('#task-cron').val(data.cron);
                        $('#task-source').val(data.source_id);
                        $('#source-table').val(data.source_table);
                        $('#target-table').val(data.target_table);
                        $('#task-target').val(data.target_id);
                        $('#task-column-map').val(JSON.stringify(data.column_map, null, 2));
                        $('#task-filter').val(data.filter_rule);

                        $('#task-modal').show();
                    }).fail(function () {
                        showAlert('#task-error-alert', 'danger', '加载任务信息失败');
                    });
                } else {
                    $('#task-modal-title').text('添加同步任务');
                    $('#task-modal').show();
                }
            }).fail(function () {
                showAlert('#task-error-alert', 'danger', '加载数据源列表失败');
            });
        }

        // 测试数据源连接
        // 替换原有的testDatasourceConnection函数
        function testDatasourceConnection() {
            const formData = {
                name: $('#datasource-name').val(),
                db_type: $('#datasource-type').val(),
                host: $('#datasource-host').val(),
                port: $('#datasource-port').val(),
                username: $('#datasource-username').val(),
                password: $('#datasource-password').val(),
                database: $('#datasource-database').val(),
                driver: $('#datasource-driver').val() || ($('#datasource-type').val() === 'mysql' ? 'pymysql' : 'ODBC Driver 17 for SQL Server')
            };

            // 显示加载状态
            const testBtn = $('#test-connection-btn');
            testBtn.html('<i class="fas fa-spinner fa-spin"></i> 测试中...');
            testBtn.prop('disabled', true);

            $.ajax({
                url: URL + '/api/datasources/test',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(formData),
                success: function (response) {
                    if (response.success) {
                        showAlert('#datasource-success-alert', 'success', response.message);
                    } else {
                        showAlert('#datasource-error-alert', 'danger', response.message);
                    }
                },
                error: function () {
                    showAlert('#datasource-error-alert', 'danger', '连接测试请求失败');
                },
                complete: function () {
                    testBtn.html('测试连接');
                    testBtn.prop('disabled', false);
                }
            });
        }

        // 保存数据源
        function saveDatasource() {
            const id = $('#datasource-id').val();
            const method = id ? 'PUT' : 'POST';
            const url = id ? `/api/datasources/${id}` : '/api/datasources';

            const formData = {
                name: $('#datasource-name').val(),
                db_type: $('#datasource-type').val(),
                host: $('#datasource-host').val(),
                port: $('#datasource-port').val(),
                username: $('#datasource-username').val(),
                password: $('#datasource-password').val(),
                database: $('#datasource-database').val(),
                driver: $('#datasource-driver').val()
            };

            $.ajax({
                url: URL + url,
                type: method,
                contentType: 'application/json',
                data: JSON.stringify(formData),
                success: function () {
                    $('#datasource-modal').hide();
                    showAlert('#datasource-success-alert', 'success', `数据源${id ? '更新' : '添加'}成功!`);
                    loadDatasources();
                    initDashboard(); // 更新仪表盘统计
                },
                error: function () {
                    showAlert('#datasource-error-alert', 'danger', `数据源${id ? '更新' : '添加'}失败`);
                }
            });
        }

        // 保存任务
        function saveTask() {
            const id = $('#task-id').val();
            const method = id ? 'PUT' : 'POST';
            const url = id ? `/api/tasks/${id}` : '/api/tasks';

            try {
                JSON.parse($('#task-column-map').val());
            } catch (e) {
                showAlert('#task-error-alert', 'danger', '字段映射必须是有效的JSON格式');
                return;
            }

            const formData = {
                name: $('#task-name').val(),
                cron: $('#task-cron').val(),
                source_id: $('#task-source').val(),
                source_table: $('#source-table').val(),
                target_table: $('#target-table').val(),
                target_id: $('#task-target').val(),


                column_map: JSON.parse($('#task-column-map').val()),
                filter_rule: $('#task-filter').val()
            };

            $.ajax({
                url: URL + url,
                type: method,
                contentType: 'application/json',
                data: JSON.stringify(formData),
                success: function () {
                    $('#task-modal').hide();
                    showAlert('#task-success-alert', 'success', `任务${id ? '更新' : '添加'}成功!`);
                    loadTasks();
                    initDashboard(); // 更新仪表盘统计
                },
                error: function () {
                    showAlert('#task-error-alert', 'danger', `任务${id ? '更新' : '添加'}失败`);
                }
            });
        }

        // 保存系统设置
        function saveSettings() {
            // 模拟保存设置
            setTimeout(function () {
                showAlert('#settings-success-alert', 'success', '系统设置已保存!');
            }, 1000);
        }

        // 更新现有的showLogDetail函数
        function showLogDetail(logId) {
            // 显示加载状态
            $('#log-details').html('<code><i class="fas fa-spinner fa-spin"></i> 加载中...</code>');
            $('#log-error-section').hide();

            // 显示模态框
            $('#log-detail-modal').show();

            // 获取日志详情
            $.get(URL + `/api/logs/${logId}`, function (log) {
                // 填充基本信息
                $('#log-task-name').text(log.task_name || '未知任务');
                $('#log-task-id').text(log.task_id || '-');
                $('#log-start-time').text(log.start_time ? new Date(log.start_time).toLocaleString() : '-');
                $('#log-end-time').text(log.end_time ? new Date(log.end_time).toLocaleString() : '-');

                // 计算持续时间
                let duration = '-';
                if (log.start_time && log.end_time) {
                    const start = new Date(log.start_time);
                    const end = new Date(log.end_time);
                    const seconds = (end - start) / 1000;
                    duration = seconds.toFixed(2) + '秒';
                }
                $('#log-duration').text(duration);

                // 记录数和状态
                $('#log-record-count').text(log.records_processed || '0');

                // 设置状态标签
                const statusBadge = $('#log-status-badge');
                statusBadge.removeClass('badge-success badge-failed badge-running');

                if (log.status === 'success') {
                    statusBadge.addClass('badge-success').text('成功');
                } else if (log.status === 'failed') {
                    statusBadge.addClass('badge-failed').text('失败');
                } else {
                    statusBadge.addClass('badge-running').text('运行中');
                }

                // 处理执行详情
                let detailsContent = '无详情信息';
                if (log.details) {
                    try {
                        // 如果是JSON，则格式化显示
                        const detailsObj = JSON.parse(log.details);
                        detailsContent = JSON.stringify(detailsObj, null, 2);
                    } catch (e) {
                        // 如果不是JSON，直接显示
                        detailsContent = log.details;
                    }
                }
                $('#log-details').html('<code>' + syntaxHighlight(detailsContent) + '</code>');

                // 处理错误信息
                if (log.error_message) {
                    $('#log-error-message').text(log.error_message);
                    $('#log-error-section').show();
                } else {
                    $('#log-error-section').hide();
                }
            }).fail(function () {
                $('#log-details').html('<code class="text-danger">加载日志详情失败</code>');
            });
        }

        // SQL语法高亮函数
        function syntaxHighlight(content) {
            // 简单的SQL关键字高亮
            const sqlKeywords = [
                'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'UPDATE', 'DELETE',
                'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'GROUP BY',
                'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'AND', 'OR',
                'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN', 'VALUES', 'SET'
            ];

            // 如果是JSON，直接返回
            if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
                return content;
            }

            // 处理SQL
            let highlighted = content;

            // 高亮关键字
            sqlKeywords.forEach(keyword => {
                const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                highlighted = highlighted.replace(regex, `<span class="sql-keyword">${keyword}</span>`);
            });

            // 高亮字符串（单引号和双引号）
            highlighted = highlighted.replace(/(['"])(.*?)\1/g, '<span class="sql-string">$1$2$1</span>');

            // 高亮数字
            highlighted = highlighted.replace(/\b\d+\b/g, '<span class="sql-number">$&</span>');

            // 高亮函数调用
            highlighted = highlighted.replace(/(\w+?)\(/g, '<span class="sql-function">$1</span>(');

            return highlighted;
        }

        // 复制详情功能
        $('#copy-log-details').click(function () {
            const detailsText = $('#log-details').text();
            navigator.clipboard.writeText(detailsText).then(function () {
                showAlert('#task-success-alert', 'success', '日志详情已复制到剪贴板');
            }, function () {
                showAlert('#task-error-alert', 'danger', '复制失败');
            });
        });

        // 显示提示消息
        function showAlert(selector, type, message) {
            const alert = $(selector);
            alert.removeClass('alert-success alert-danger').addClass(`alert-${type}`).text(message).show();

            setTimeout(function () {
                alert.fadeOut();
            }, 3000);
        }

        // 全局函数
        window.editDatasource = function (id) {
            showDatasourceModal(id);
        };

        window.deleteDatasource = function (id) {
            if (confirm('确定要删除这个数据源吗？')) {
                $.ajax({
                    url: URL + `/api/datasources/${id}`,
                    type: 'DELETE',
                    success: function () {
                        showAlert('#datasource-success-alert', 'success', '数据源删除成功!');
                        loadDatasources();
                        initDashboard(); // 更新仪表盘统计
                    },
                    error: function () {
                        showAlert('#datasource-error-alert', 'danger', '数据源删除失败');
                    }
                });
            }
        };

        window.editTask = function (id) {
            showTaskModal(id);
        };

        window.deleteTask = function (id) {
            if (confirm('确定要删除这个任务吗？')) {
                $.ajax({
                    url: URL + `/api/tasks/${id}`,
                    type: 'DELETE',
                    success: function () {
                        showAlert('#task-success-alert', 'success', '任务删除成功!');
                        loadTasks();
                        initDashboard(); // 更新仪表盘统计
                    },
                    error: function () {
                        showAlert('#task-error-alert', 'danger', '任务删除失败');
                    }
                });
            }
        };

        window.runTask = function (id) {
            $.post(URL + `/api/tasks/${id}/run`, function () {
                showAlert('#task-success-alert', 'success', '任务已开始执行!');
                loadTasks();
                initDashboard(); // 更新仪表盘统计
            }).fail(function () {
                showAlert('#task-error-alert', 'danger', '任务执行失败');
            });
        };


        window.togglePauseTask = function (taskId) {
            let isPaused;
            const task = globalTasks.find(task => task.id === taskId);
            if (task) {
                isPaused = task.status === 'paused';
            }
            let pauseBtn = $(`#pause-btn-${taskId}`);
            if (!isPaused) {
                // 暂停任务
                $.post(`${URL}/api/tasks/${taskId}/pause`, function () {
                    // 改变样式图标
                    pauseBtn.find('i').removeClass('fa-pause').addClass('fa-play');
                    showAlert('#task-success-alert', 'success', '任务已暂停');
                }).fail(function () {
                    showAlert('#task-error-alert', 'danger', '任务暂停失败');
                });
            } else {
                // 恢复任务
                $.post(`${URL}/api/tasks/${taskId}/resume`, function () {
                    pauseBtn.find('i').removeClass('fa-play').addClass('fa-pause');
                    showAlert('#task-success-alert', 'success', '任务已恢复');
                }).fail(function () {
                    showAlert('#task-error-alert', 'danger', '任务恢复失败');
                });
            }
            loadTasks();
        };
    });