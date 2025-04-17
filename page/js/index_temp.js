const URL = "http://127.0.0.1:5000";
let globalTasks = [];
// 全局变量
let currentPage = 'dashboard';
$(document).ready(function () {
    // 初始化页面
    initDashboard();

    // 确保Bootstrap的JavaScript已加载
    if (!$.fn.dropdown) {
        console.error('Bootstrap JavaScript not loaded!');
        return;
    }

    // 初始化所有下拉框
    $('.dropdown-toggle').dropdown();

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

    // 测试数据库连接
    $('#test-connection-btn').click(function () {
        testDatasourceConnection();
    });

    $('#save-connection-btn').click(function () {
        saveDatasource();
    })

    // 数据源表单提交
    $('#datasource-form').submit(function (e) {
        e.preventDefault();
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

    // 任务表单提交
    $('#task-form').submit(function (e) {
        e.preventDefault(e);
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

})

// 加载数据源列表
function loadDatasources(page = 1, pageSize = 2, name = '', dbType = '') {
    const params = {page, pageSize};
    if (name) {
        params.name = name;
    }
    if (dbType) {
        params.dbType = dbType;
    }

    $.get(URL + '/api/datasources', params, function (response) {
        let html = '';
        response.datasources.forEach(ds => {
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
        // 确保分页控件渲染
        if (response.totalPages > 1) {
            renderDatasourcePagination(response.totalDatasources, response.totalPages, page, pageSize, name, dbType);
        } else {
            $('#datasources-pagination').html(''); // 如果只有一页，清空分页控件
        }
    }).fail(function () {
        showAlert('#datasource-error-alert', 'danger', '加载数据源列表失败');
    });
}

// 加载任务列表
function loadTasks() {
    $.get(URL + '/api/tasks', function (tasks) {
        // 先获取所有数据源用于显示名称
        $.get(URL + '/api/datasources', function (response) {
            let datasources = response.datasources;
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
                            <div class="dropdown">
                                <button class="btn btn-sm btn-secondary dropdown-toggle" type="button" 
                                    id="dropdownMenuButton${task.id}" data-bs-toggle="dropdown" aria-expanded="false">
                                    操作
                                </button>
                                <div class="dropdown-menu" aria-labelledby="dropdownMenuButton${task.id}">
                                    <a class="dropdown-item" href="#" onclick="runTask(${task.id})"><i class="fas fa-play"></i> 立即执行</a>
                                    <a class="dropdown-item" href="#" onclick="togglePauseTask(${task.id})"><i class="fas ${pauseBtnIcon}"></i> ${pauseBtnText}</a>
                                    <a class="dropdown-item" href="#" onclick="editTask(${task.id})"><i class="fas fa-edit"></i> 编辑</a>
                                    <a class="dropdown-item text-danger" href="#" onclick="deleteTask(${task.id})"><i class="fas fa-trash"></i> 删除</a>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            });
            $('#tasks-list').html(html);
            // 初始化所有下拉框
            $('.dropdown-toggle').dropdown();
        });
    }).fail(function () {
        showAlert('#task-error-alert', 'danger', '加载任务列表失败');
    });


    // 显示任务模态框
    window.showTaskModal = function (id = null) {
        $('#task-form')[0].reset();
        $('#task-id').val('');

        // 加载数据源下拉选项
        $.get(URL + '/api/datasources', function (response) {
            let sourceOptions = '<option value="">-- 请选择 --</option>';
            let targetOptions = '<option value="">-- 请选择 --</option>';

            response.datasources.forEach(ds => {
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

    // 保存系统设置
    function saveSettings() {
        // 模拟保存设置
        setTimeout(function () {
            showAlert('#settings-success-alert', 'success', '系统设置已保存!');
        }, 1000);
    }


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

    // 添加搜索功能
    $('#log-search-btn').click(function () {
        const taskName = $('#log-search-input').val();
        const status = $('#log-status-select').val();
        loadLogs(1, 10, taskName, status);
    });

    // 添加搜索功能
    $('#datasource-search-btn').click(function () {
        const name = $('#datasource-search-input').val();
        const dbType = $('#datasource-type-select').val();
        loadDatasources(1, 10, name, dbType);
    });
}

function showAlert(selector, type, message) {
    const alert = $(selector);
    alert.removeClass('alert-success alert-danger alert-info')
        .addClass(`alert-${type}`)
        .text(message)
        .stop(true, true) // 清除动画队列
        .fadeIn();

    setTimeout(() => alert.fadeOut(), 3000);
}

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

// 全局函数
function editDatasource(id) {
    showDatasourceModal(id);
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
        error: function (e) {
            console.log(e + '')
            showAlert('#task-error-alert', 'danger', `任务${id ? '更新' : '添加'}失败, `);
        }
    });
}

// 初始化仪表盘
function initDashboard() {
    $.get(URL + '/api/datasources', function (data) {
        $('#total-datasources').text(data.totalDatasources);
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

// 加载执行日志
function loadLogs(page = 1, pageSize = 10, taskName = '', status = '') {
    const params = {page, pageSize};
    if (taskName) {
        params.taskName = taskName;
    }
    if (status) {
        params.status = status;
    }
    $.get(URL + '/api/logs', params, function (response) {
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
                            onclick="loadLogs(${page - 1}, ${pageSize}, '${taskName}', '${status}')" ${page === 1 ? 'disabled' : ''}>
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
                        onclick="loadLogs(1, ${pageSize}, '${taskName}', '${status}')">1</button>
                <span class="pagination-ellipsis">...</span>
            `;
        }

        // 显示页码
        for (let i = startPage; i <= endPage; i++) {
            paginationHtml += `
                <button class="pagination-btn ${i === page ? 'active' : ''}"
                        onclick="loadLogs(${i}, ${pageSize}, '${taskName}', '${status}')">${i}</button>
            `;
        }

        // 显示最后一页和省略号（如果当前页不在最后几页）
        if (endPage < totalPages) {
            paginationHtml += `
                <span class="pagination-ellipsis">...</span>
                <button class="pagination-btn ${totalPages === page ? 'active' : ''}"
                        onclick="loadLogs(${totalPages}, ${pageSize}, '${taskName}', '${status}')">${totalPages}</button>
            `;
        }

        paginationHtml += `
                    </div>

                    <button class="pagination-btn ${page === totalPages ? 'disabled' : ''}"
                            onclick="loadLogs(${page + 1}, ${pageSize}, '${taskName}', '${status}')" ${page === totalPages ? 'disabled' : ''}>
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>

                <div class="page-size-selector">
                    <span>每页显示</span>
                    <select class="form-control-sm" onchange="loadLogs(1, parseInt(this.value), '${taskName}', '${status}')">
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
}

function renderDatasourcePagination(totalCount, totalPages, currentPage, pageSize, name, dbType) {
    let paginationHtml = `
        <div class="pagination-container">
            <div class="pagination-summary">
                显示 <span class="text-primary">${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, totalCount)}</span>
                条，共 <span class="text-primary">${totalCount}</span> 条记录
            </div>

            <div class="pagination-controls">
                <button class="pagination-btn ${currentPage === 1 ? 'disabled' : ''}"
                        onclick="loadDatasources(${currentPage - 1}, ${pageSize}, '${name}', '${dbType}')" ${currentPage === 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i>
                </button>

                <div class="pagination-pages">
    `;

    // 计算页码范围（最多显示7个页码）
    let startPage = Math.max(1, currentPage - 3);
    let endPage = Math.min(totalPages, currentPage + 3);

    if (currentPage <= 4) {
        endPage = Math.min(7, totalPages);
    } else if (currentPage >= totalPages - 3) {
        startPage = Math.max(totalPages - 6, 1);
    }

    // 显示第一页和省略号（如果当前页不在前几页）
    if (startPage > 1) {
        paginationHtml += `
            <button class="pagination-btn ${1 === currentPage ? 'active' : ''}"
                    onclick="loadDatasources(1, ${pageSize}, '${name}', '${dbType}')">1</button>
            <span class="pagination-ellipsis">...</span>
        `;
    }

    // 显示页码
    for (let i = startPage; i <= endPage; i++) {
        paginationHtml += `
            <button class="pagination-btn ${i === currentPage ? 'active' : ''}"
                    onclick="loadDatasources(${i}, ${pageSize}, '${name}', '${dbType}')">${i}</button>
        `;
    }

    // 显示最后一页和省略号（如果当前页不在最后几页）
    if (endPage < totalPages) {
        paginationHtml += `
            <span class="pagination-ellipsis">...</span>
            <button class="pagination-btn ${totalPages === currentPage ? 'active' : ''}"
                    onclick="loadDatasources(${totalPages}, ${pageSize}, '${name}', '${dbType}')">${totalPages}</button>
        `;
    }

    paginationHtml += `
                </div>

                <button class="pagination-btn ${currentPage === totalPages ? 'disabled' : ''}"
                        onclick="loadDatasources(${currentPage + 1}, ${pageSize}, '${name}', '${dbType}')" ${currentPage === totalPages ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>

            <div class="page-size-selector">
                <span>每页显示</span>
                <select class="form-control-sm" onchange="loadDatasources(1, parseInt(this.value), '${name}', '${dbType}')">
                    <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
                    <option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option>
                    <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
                </select>
            </div>
        </div>
    `;
    $('#datasources-pagination').html(paginationHtml);
}

// 测试数据源连接
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

function deleteDatasource(id) {
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
}

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
        duration = log.execution_time.toFixed(2) + '秒'
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
        $('#log-details').html('<pre><code>' + syntaxHighlight(detailsContent) + '</code></pre>');

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

function syntaxHighlight(content) {
    // 如果是JSON，直接使用JSON高亮
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
        try {
            const jsonObj = JSON.parse(content);
            const formattedJson = JSON.stringify(jsonObj, null, 2);
            return highlightJson(formattedJson);
        } catch (e) {
            return content; // 如果JSON解析失败，返回原始内容
        }
    }

    // SQL关键字列表
    const sqlKeywords = [
        'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'UPDATE', 'DELETE',
        'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'GROUP BY',
        'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'AND', 'OR',
        'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN', 'VALUES', 'SET'
    ];

    // 分割SQL为标记(token)进行处理
    const tokens = content.split(/(\b|\s+|[,;()=<>+\-*/])/);
    let result = '';

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (!token) continue;

        // 检查是否为SQL关键字
        if (sqlKeywords.includes(token.toUpperCase())) {
            result += `<span class="sql-keyword">${token}</span>`;
        }
        // 检查是否为字符串
        else if (/^(['"]).*\1$/.test(token)) {
            result += `<span class="sql-string">${token}</span>`;
        }
        // 检查是否为数字
        else if (/^\d+$/.test(token)) {
            result += `<span class="sql-number">${token}</span>`;
        }
        // 检查是否为函数名
        else if (/^\w+\($/.test(token)) {
            const funcName = token.slice(0, -1);
            result += `<span class="sql-function">${funcName}</span>(`;
        }
        // 其他情况
        else {
            result += token;
        }
    }

    return result;
}

function highlightJson(json) {
    return json
        .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, function (match) {
            let cls = 'json-string';
            if (/:$/.test(match)) {
                cls = 'json-key';
            }
            return `<span class="${cls}">${match}</span>`;
        })
        .replace(/\b(true|false|null)\b/g, '<span class="json-literal">$1</span>')
        .replace(/\b\d+\b/g, '<span class="json-number">$&</span>');
}

$('#copy-log-details').click(function (event) {
    event.preventDefault();
    const detailsElement = $('#log-details');
    const textToCopy = detailsElement.text().replace(/\s+/g, ' ').trim();

    // 优先使用现代Clipboard API
    if (navigator.clipboard) {
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                showAlert('#task-success-alert', 'success', '复制成功');
            })
            .catch(err => {
                showAlert('#task-error-alert', 'danger', '复制失败: ' + err.message);
            });
    }
    // 降级方案
    else {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                showAlert('#task-success-alert', 'success', '复制成功');
            } else {
                showAlert('#task-error-alert', 'danger', '复制失败');
            }
        } catch (err) {
            showAlert('#task-error-alert', 'danger', '复制失败: ' + err);
        } finally {
            document.body.removeChild(textarea);
        }
    }
})