// 清除功能
function clearStorageAndUI() {
    console.log('clearStorageAndUI 开始执行');
    const resultsDiv = document.getElementById('results');
    
    Promise.all([
        new Promise(resolve => chrome.storage.local.remove('results', resolve)),
        new Promise(resolve => chrome.storage.local.remove('noteProcessed', resolve))
    ]).then(() => {
        if (resultsDiv) {
            resultsDiv.innerHTML = '已清除所有数据';
        }
        console.log('所有数据已清除');
    }).catch(error => {
        console.error('清除数据时出错:', error);
    });
}

function showResults() {
    // 显示结果
    const resultsDiv = document.getElementById('results');
    chrome.storage.local.get('results', function(data) {
        if (data.results) {
            resultsDiv.innerHTML = 'Query: ' + data.results[0].query + '<br>' + "已处理" + data.results.length + "条笔记";
        }else {
            resultsDiv.innerHTML = "未处理笔记";
        }
    });

    chrome.storage.local.get('noteProcessed', function(data) {
        const resultsDiv = document.getElementById('results');
        
        // 检查是否有结果
        if (data.noteProcessed && data.noteProcessed.length > 0) {
            // 创建下载按钮
            const downloadButton = document.createElement('button');
            downloadButton.innerText = '下载结果为 JSON';
        
            // 设置按钮点击事件
            downloadButton.addEventListener('click', () => {
                const blob = new Blob([JSON.stringify(data.noteProcessed, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                // 创建一个链接并触发下载
                const a = document.createElement('a');
                a.href = url;
                a.download = 'results.json'; // 下载文件名
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url); // 释放内存
            });
        
            // 将下载按钮添加到结果区域
            resultsDiv.appendChild(downloadButton);
        } else {
            console.log('没有结果可下载');
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyBtn = document.getElementById('save-api-key');
    const searchKeywordInput = document.getElementById('search-keyword');
    const searchBtn = document.getElementById('search-btn');
    const clearBtn = document.getElementById('clear');
    const resultsDiv = document.getElementById('results');

    // 检查是否存在 API Key
    chrome.storage.local.get('apiKey', function(data) {
        if (data.apiKey) {
            apiKeyInput.value = data.apiKey;
            apiKeyInput.placeholder = '修改 API Key';
            saveApiKeyBtn.textContent = '更新';
        }
    });

    // 保存或更新 API Key
    saveApiKeyBtn.addEventListener('click', function() {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            chrome.storage.local.set({apiKey: apiKey}, function() {
                alert('API Key 已保存');
                apiKeyInput.placeholder = '修改 API Key';
                saveApiKeyBtn.textContent = '更新';
            });
        } else {
            alert('请输入有效的 API Key');
        }
    });

    // 搜索功能
    searchBtn.addEventListener('click', function() {
        const keyword = searchKeywordInput.value;
        //确保输入框不为空
        if (keyword.trim() === '') {
            alert('请输入关键词');
            return;
        }
        chrome.storage.local.get('apiKey', function(data) {
            if (data.apiKey) {
                // 这里添加使用 API Key 进行搜索的逻辑
                clearStorageAndUI();
                resultsDiv.innerHTML = '开始搜索 ' + keyword + '...';
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    chrome.tabs.sendMessage(tabs[0].id, {action: "search", keyword: keyword, apiKey: data.apiKey});
                });
            } else {
                alert('请先设置 API Key');
            }
        });
    });

    showResults()

    if (clearBtn) {
        clearBtn.addEventListener('click', clearStorageAndUI);
    } else {
        console.error('未找到清除按钮元素');
    }

    
});


// 接收来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'noteResults') {
        // 处理笔记结果
        document.getElementById('results').innerHTML = `正在处理【${message.data.title}】请稍候`;
    } else if (message.type === 'stopSearch') {
        showResults()
        
    }
});

console.log('Load popup success');
