// 在文件顶部添加以下导入语句
import { singleNoteAnalysisPrompt } from './prompt.js';

function convertTableToJson(markdown) {
    const cleanedMarkdown = markdown.slice(markdown.indexOf("|"), markdown.lastIndexOf("|") + 1);
    const lines = cleanedMarkdown.trim().split("\n");
    const headers = lines[0].split("|").map(h => h.trim()).filter(h => h);
    const data = lines.slice(2).map(line => {
        const values = line.split("|").map(v => v.trim()).filter(v => v);
        return headers.reduce((obj, header, index) => {
          if (header === "原声") {
            obj[header] = values[index].split("；").map(v => v.trim()); // 将“原声”按“；”分隔成数组
          } else {
            obj[header] = values[index];
          }
          return obj;
        }, {});
      });
    return data;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'noteResults') {
        // 存储原始结果
        chrome.storage.local.get('results', (data) => {
            const existingResults = Array.isArray(data.results) ? data.results : [];
            existingResults.push(message.data); // 将新结果添加到现有结果中

            // 更新存储
            chrome.storage.local.set({ results: existingResults }, function () {
                console.log('Results saved:', existingResults.length);
            });
        });

        // 使用正确导入的 singleNoteAnalysisPrompt 函数
        const analysisPrompt = singleNoteAnalysisPrompt({context: JSON.stringify(message.data)});
        console.log(analysisPrompt)
        chrome.tabs.sendMessage(sender.tab.id, {
            action: 'callChatAPI',
            data: [{role: 'user', content: analysisPrompt}]
        }, response => {
            console.log('Chat API response:', response);
            // 将response存储到noteProcessed数组中
            try {
                response = convertTableToJson(response);
            } catch (error) {
                console.error('Error converting table to JSON:', error);
                return;
            }
            chrome.storage.local.get('noteProcessed', (data) => {
                const existingProcessed = Array.isArray(data.noteProcessed) ? data.noteProcessed : [];
                existingProcessed.push(response);
                chrome.storage.local.set({ noteProcessed: existingProcessed }, function () {
                    console.log('Note processed saved:', existingProcessed.length);
                });
            });
        });
    }
});
