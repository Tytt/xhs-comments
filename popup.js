// 弹出窗口逻辑
document.addEventListener('DOMContentLoaded', function() {
    const startCollectBtn = document.getElementById('start-collect');
    const exportDataBtn = document.getElementById('export-data');
    const statusElement = document.getElementById('status');
    const countElement = document.getElementById('comment-count');
    const autoScrollCheckbox = document.getElementById('auto-scroll');
    const exportCsvCheckbox = document.getElementById('export-csv');
    
    let collectedComments = [];
    let isCollecting = false;
    
    // 初始化
    init();
    
    function init() {
        // 检查当前是否在小红书页面
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTab = tabs[0];
            if (currentTab.url.includes('xiaohongshu.com')) {
                updateStatus('准备就绪', 'ready');
                startCollectBtn.disabled = false;
            } else {
                updateStatus('请在小红书页面使用', 'error');
                startCollectBtn.disabled = true;
            }
        });
        
        // 从存储中恢复数据
        chrome.storage.local.get(['xhs_comments', 'xhs_settings'], function(result) {
            if (result.xhs_comments) {
                collectedComments = result.xhs_comments;
                updateCommentCount(collectedComments.length);
                exportDataBtn.disabled = collectedComments.length === 0;
            }
            
            if (result.xhs_settings) {
                autoScrollCheckbox.checked = result.xhs_settings.autoScroll !== false;
                exportCsvCheckbox.checked = result.xhs_settings.exportCsv !== false;
            }
        });
    }
    
    // 开始采集按钮点击事件
    startCollectBtn.addEventListener('click', function() {
        if (isCollecting) {
            stopCollecting();
        } else {
            startCollecting();
        }
    });
    
    // 导出数据按钮点击事件
    exportDataBtn.addEventListener('click', function() {
        exportComments();
    });
    
    // 设置变更监听
    autoScrollCheckbox.addEventListener('change', saveSettings);
    exportCsvCheckbox.addEventListener('change', saveSettings);
    
    // 开始采集
    function startCollecting() {
        isCollecting = true;
        updateStatus('正在采集...', 'collecting');
        startCollectBtn.innerHTML = '<span class="btn-icon">⏹️</span>停止采集';
        startCollectBtn.className = 'btn btn-secondary';
        
        // 保存设置
        saveSettings();
        
        // 向内容脚本发送采集指令
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'startCollecting',
                settings: {
                    autoScroll: autoScrollCheckbox.checked,
                    exportCsv: exportCsvCheckbox.checked
                }
            }, function(response) {
                if (chrome.runtime.lastError) {
                    console.error('发送消息失败:', chrome.runtime.lastError);
                    updateStatus('通信失败，请刷新页面', 'error');
                    resetCollectingState();
                }
            });
        });
        
        // 开始监听采集进度
        startProgressMonitoring();
    }
    
    // 停止采集
    function stopCollecting() {
        isCollecting = false;
        updateStatus('采集已停止', 'ready');
        resetCollectingState();
        
        // 向内容脚本发送停止指令
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'stopCollecting'
            });
        });
    }
    
    // 重置采集状态
    function resetCollectingState() {
        startCollectBtn.innerHTML = '<span class="btn-icon">🚀</span>开始采集';
        startCollectBtn.className = 'btn btn-primary';
        statusElement.classList.remove('collecting');
    }
    
    // 监听采集进度
    function startProgressMonitoring() {
        const interval = setInterval(function() {
            if (!isCollecting) {
                clearInterval(interval);
                return;
            }
            
            // 检查存储中的评论数据
            chrome.storage.local.get(['xhs_comments'], function(result) {
                if (result.xhs_comments) {
                    const comments = result.xhs_comments;
                    collectedComments = comments;
                    updateCommentCount(comments.length);
                    exportDataBtn.disabled = comments.length === 0;
                }
            });
        }, 1000);
    }
    
    // 导出评论数据
    function exportComments() {
        if (collectedComments.length === 0) {
            alert('没有可导出的评论数据');
            return;
        }
        
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `小红书评论_${timestamp}.json`;
        
        const exportData = {
            exportTime: new Date().toISOString(),
            exportSource: 'XHS评论采集插件',
            totalComments: collectedComments.length,
            comments: collectedComments
        };
        
        // 创建下载链接
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json;charset=utf-8'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        // 如果启用了CSV导出，也导出CSV
        if (exportCsvCheckbox.checked) {
            exportCommentsCSV(timestamp);
        }
        
        // 显示成功消息
        showNotification('导出成功', 'success');
    }
    
    // 导出CSV格式
    function exportCommentsCSV(timestamp) {
        const filename = `小红书评论_${timestamp}.csv`;
        
        const headers = ['序号', '用户名', '评论内容', '时间', '点赞数'];
        const csvContent = [
            headers.join(','),
            ...collectedComments.map(comment => [
                comment.id,
                `"${(comment.username || '').replace(/"/g, '""')}"`,
                `"${(comment.content || '').replace(/"/g, '""')}"`,
                `"${(comment.time || '').replace(/"/g, '""')}"`,
                comment.likes || 0
            ].join(','))
        ].join('\n');
        
        const blob = new Blob(['\ufeff' + csvContent], {
            type: 'text/csv;charset=utf-8'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    // 保存设置
    function saveSettings() {
        const settings = {
            autoScroll: autoScrollCheckbox.checked,
            exportCsv: exportCsvCheckbox.checked
        };
        
        chrome.storage.local.set({
            xhs_settings: settings
        });
    }
    
    // 更新状态
    function updateStatus(text, type) {
        statusElement.textContent = text;
        statusElement.className = `status ${type}`;
        
        if (type === 'collecting') {
            statusElement.classList.add('collecting');
        }
    }
    
    // 更新评论计数
    function updateCommentCount(count) {
        countElement.textContent = count;
        
        // 添加动画效果
        countElement.style.transform = 'scale(1.2)';
        setTimeout(() => {
            countElement.style.transform = 'scale(1)';
        }, 200);
    }
    
    // 显示通知
    function showNotification(message, type) {
        // 简单的通知实现
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 6px;
            color: white;
            font-size: 14px;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        if (type === 'success') {
            notification.style.background = '#28a745';
        } else if (type === 'error') {
            notification.style.background = '#dc3545';
        }
        
        document.body.appendChild(notification);
        
        // 显示动画
        setTimeout(() => {
            notification.style.opacity = '1';
        }, 100);
        
        // 自动消失
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    // 监听来自内容脚本的消息
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === 'collectionComplete') {
            isCollecting = false;
            updateStatus('采集完成', 'success');
            resetCollectingState();
            
            if (request.comments) {
                collectedComments = request.comments;
                updateCommentCount(collectedComments.length);
                exportDataBtn.disabled = false;
                
                // 保存到存储
                chrome.storage.local.set({
                    xhs_comments: collectedComments
                });
            }
            
            sendResponse({status: 'ok'});
        } else if (request.action === 'collectionError') {
            isCollecting = false;
            updateStatus('采集失败', 'error');
            resetCollectingState();
            sendResponse({status: 'ok'});
        } else if (request.action === 'updateProgress') {
            if (request.count !== undefined) {
                updateCommentCount(request.count);
            }
            sendResponse({status: 'ok'});
        }
    });
}); 