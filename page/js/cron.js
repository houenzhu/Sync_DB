document.addEventListener('DOMContentLoaded', function () {
    // 获取所有元素
    const cronBtns = document.querySelectorAll('.cron-btn');
    const customInputs = document.querySelectorAll('.custom-input');
    const specificInputs = document.querySelectorAll('.specific-input');
    const expressionDisplay = document.querySelector('.expression-display');
    const descriptionDisplay = document.querySelector('.description');
    const copyBtn = document.querySelector('.copy-btn');

    // 初始 cron 表达式各部分
    let cronParts = ['*', '*', '*', '*', '*'];

    // 更新 cron 表达式
    function updateCronExpression() {
        expressionDisplay.textContent = cronParts.join(' ');
        updateDescription();
    }

    // 更新描述文本
    function updateDescription() {
        const [minute, hour, day, month, weekday] = cronParts;
        let desc = '';

        // 解析分钟
        if (minute === '*') {
            desc += '每分钟';
        } else if (minute.includes('/')) {
            const [, value] = minute.split('/');
            desc += `每${value}分钟`;
        } else if (minute.includes(',')) {
            desc += `在分钟 ${minute}`;
        } else {
            desc += `在分钟 ${minute}`;
        }

        // 解析小时
        if (hour === '*') {
            desc += '的每小时';
        } else if (hour.includes('/')) {
            const [, value] = hour.split('/');
            desc += `的每${value}小时`;
        } else if (hour.includes(',')) {
            desc += `的小时 ${hour}`;
        } else {
            desc += `的小时 ${hour}`;
        }

        // 解析日
        if (day === '*') {
            desc += '的每天';
        } else if (day.includes('/')) {
            const [, value] = day.split('/');
            desc += `的每${value}天`;
        } else if (day.includes(',')) {
            desc += `的日期 ${day}`;
        } else {
            desc += `的日期 ${day}`;
        }

        // 解析月
        if (month === '*') {
            desc += '的每月';
        } else if (month.includes('/')) {
            const [, value] = month.split('/');
            desc += `的每${value}个月`;
        } else if (month.includes(',')) {
            desc += `的月份 ${month}`;
        } else {
            desc += `的月份 ${month}`;
        }

        // 解析星期
        if (weekday === '*') {
            desc += '的每周';
        } else if (weekday.includes('/')) {
            const [, value] = weekday.split('/');
            desc += `的每${value}天(周)`;
        } else if (weekday.includes(',')) {
            desc += `的星期 ${weekday}`;
        } else {
            desc += `的星期 ${weekday}`;
        }

        desc += '执行一次';
        descriptionDisplay.textContent = desc;
    }

    // 处理按钮点击
    cronBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            // 获取按钮所属的部分 (minute, hour, day, month, weekday)
            const section = this.closest('.cron-options').classList[1];
            const value = this.getAttribute('data-value');

            // 移除同组的 active 类
            this.parentElement.querySelectorAll('.cron-btn').forEach(b => {
                b.classList.remove('active');
            });

            // 添加 active 类到当前按钮
            this.classList.add('active');

            // 更新对应的 cron 部分
            let index;
            switch (section) {
                case 'minute':
                    index = 0;
                    break;
                case 'hour':
                    index = 1;
                    break;
                case 'day':
                    index = 2;
                    break;
                case 'month':
                    index = 3;
                    break;
                case 'weekday':
                    index = 4;
                    break;
            }

            cronParts[index] = value;
            updateCronExpression();
        });
    });

    // 处理自定义输入
    customInputs.forEach(input => {
        input.addEventListener('change', function () {
            const section = this.closest('.cron-options').classList[1];
            const value = this.value;

            let index;
            switch (section) {
                case 'minute':
                    index = 0;
                    break;
                case 'hour':
                    index = 1;
                    break;
                case 'day':
                    index = 2;
                    break;
                case 'month':
                    index = 3;
                    break;
                case 'weekday':
                    index = 4;
                    break;
            }

            cronParts[index] = `*/${value}`;
            updateCronExpression();
        });
    });

    // 处理特定值输入
    specificInputs.forEach(input => {
        input.addEventListener('change', function () {
            const section = this.closest('.cron-options').classList[1];
            const value = this.value.trim();

            if (value) {
                let index;
                switch (section) {
                    case 'minute':
                        index = 0;
                        break;
                    case 'hour':
                        index = 1;
                        break;
                    case 'day':
                        index = 2;
                        break;
                    case 'month':
                        index = 3;
                        break;
                    case 'weekday':
                        index = 4;
                        break;
                }

                cronParts[index] = value;
                updateCronExpression();
            }
        });
    });

    // 复制功能
    copyBtn.addEventListener('click', function () {
        navigator.clipboard.writeText(expressionDisplay.textContent)
            .then(() => {
                const originalText = this.innerHTML;
                this.innerHTML = '<i class="fas fa-check"></i> 已复制';
                setTimeout(() => {
                    this.innerHTML = originalText;
                }, 2000);
            })
            .catch(err => {
                console.error('复制失败: ', err);
            });
    });

    // 初始化
    updateCronExpression();
});