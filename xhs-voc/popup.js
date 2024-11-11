// 清除功能
function clearStorageAndUI() {
    console.log('clearStorageAndUI 开始执行');
    const resultsDiv = document.getElementById('results');
    
    Promise.all([
        new Promise(resolve => chrome.storage.local.remove('results', resolve)),
        new Promise(resolve => chrome.storage.local.remove('report', resolve)),
        new Promise(resolve => chrome.storage.local.remove('aspectCategoryPositiveCounts', resolve)),
        new Promise(resolve => chrome.storage.local.remove('aspectCategoryNegativeCounts', resolve)),
        new Promise(resolve => chrome.storage.local.remove('searchKeyword', resolve)),
        new Promise(resolve => chrome.storage.local.remove('tokenUsage', resolve)),
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

price = {
    "glm-4-plus": {"prompt_tokens": 0.05, "completion_tokens": 0.05},
    "glm-4-long": {"prompt_tokens": 0.001, "completion_tokens": 0.001},
}


function showResults() {
    chrome.storage.local.get(['searchKeyword', 'tokenUsage', 'report','aspectCategoryPositiveCounts', 'aspectCategoryNegativeCounts'], function(data) {
        const searchKeyword = data.searchKeyword;
        html = '<h2>' + searchKeyword + '</h2>';
        const tokenUsage = data.tokenUsage;
        if (tokenUsage) {
            const money = tokenUsage.prompt_tokens / 1000 * price["glm-4-plus"].prompt_tokens + tokenUsage.completion_tokens / 1000 * price["glm-4-plus"].completion_tokens;
            html += '<h3>调用统计</h3>';
            html += `<p>总token使用量: <br>输入 - ${tokenUsage.prompt_tokens}<br>输出 - ${tokenUsage.completion_tokens}<br>总费用: ${money.toFixed(2)}元</p>`;
        }
        
        let report = data.report;
        // 如果report为空，则设置为“暂无分析报告”
        if (!report) {
            report = '暂无分析报告';
        }
        // 换行替换为<br>
        report = report.replace(/\n/g, '<br>');
        html += '<h2>分析报告</h2>' + "<div>" + report + "</div>";
        const stats = data.aspectCategoryPositiveCounts;
        let htmlTable = generateHTMLTable(stats);
        // 给表格html加标题
        htmlTable = `<h2>正面评论</h2>` + htmlTable;
        // 正面评论
        html += htmlTable;
        // 再加入负面评论
        const stats2 = data.aspectCategoryNegativeCounts;
        let htmlTable2 = generateHTMLTable(stats2);
        htmlTable2 = `<h2>负面评论</h2>` + htmlTable2;
        html += htmlTable2;

        document.getElementById('results').innerHTML = html;

    })
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
        const searchNum = document.getElementById('search-num').value;
        if (searchNum === '') {
            alert('请输入搜索数量');
            return;
        }

        //确保输入框不为空
        if (keyword.trim() === '') {
            alert('请输入关键词');
            return;
        }
        chrome.storage.local.get('apiKey', function(data) {
            if (data.apiKey) {
                // 这里添加使用 API Key 进行搜索的逻辑
                clearStorageAndUI();
                chrome.storage.local.set({searchKeyword: keyword}, function() {
                    console.log('关键词已保存: ' + keyword);
                })
                resultsDiv.innerHTML = '开始搜索 ' + keyword + '...';
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    chrome.tabs.sendMessage(tabs[0].id, {action: "search", keyword: keyword, searchNum:searchNum});
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

// 将统计结果生成 HTML 表格
function generateHTMLTable(stats) {
    let html = `<table border="1">
                    <thead>
                        <tr>
                            <th>类别</th>
                            <th>数量</th>
                            <th>占比</th>
                            <th>原声</th>
                        </tr>
                    </thead>
                    <tbody>`;
    
    // 按数量排序
    const sortedStats = Object.keys(stats)
        .filter(category => !category.includes("_占比") && !category.includes("原声")) // 过滤掉占比字段
        .map(category => ({
            category,
            count: stats[category],
        }))
        .sort((a, b) => b.count - a.count); // 按 count 降序排序
    console.log("sortedStats", sortedStats);
    
    // 遍历排序后的统计结果
    for (const {category, count} of sortedStats) {
        if (!category.includes("_占比") && !category.includes("原声")) { // 排除百分比键
            //去除数量为0的内容
            if (count == 0) {
                continue;
            }
            const percent = stats[category + "_占比"];
            // 原声为数组，转为字符串
            const original = stats[category + "原声"];
            console.log("original", category);
            console.log("original", original);
            // 取前10个
            const originalStr = original.slice(0, 10).join("； ");
            html += `<tr>
                        <td>${category}</td>
                        <td>${count}</td>
                        <td>${percent}</td>
                        <td>${originalStr}</td>
                     </tr>`;
        }
    }
    
    html += `</tbody></table>`;
    return html;
}

// 接收来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'noteResults') {
        // 处理笔记结果
        document.getElementById('results').innerHTML = `正在处理【${message.data.title}】请稍候...`;
    }
    if (message.type === 'stopSearch' || message.type === 'processedOne') {
        chrome.storage.local.get('noteProcessed', (data) => {
            if (data.noteProcessed) {
                document.getElementById('results').innerHTML = `已分析完${data.noteProcessed.length}篇笔记... 耐心等待一下...`;
            } else {
                document.getElementById('results').innerHTML = `已分析完0篇笔记`;
            }
        });
    }
    if (message.type === 'finishAnalysis') {
        document.getElementById('results').innerHTML = `分析完成！开始生成报告...`;
    }
    if (message.type === 'finishReport'){
        showResults();
    }
});

console.log('Load popup success');
