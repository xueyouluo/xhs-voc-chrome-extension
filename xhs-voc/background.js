// 在文件顶部添加以下导入语句
import { singleNoteAnalysisPrompt, allNoteAnalysisPrompt } from './prompt.js';

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


function removeFields(data) {
    return data.map((item, index) => {
        const { title, content, comments } = item;

        // 处理comments和replies中的字段
        const newComments = comments.map(comment => {
            const { content, replies } = comment;

            // 处理每条评论的回复
            const newReplies = replies.map(reply => {
                return { content: reply.content };
            });

            return { content, replies: newReplies };
        });

        return { id: `${index + 1}`, title, content, comments: newComments };
    });
}

async function callChatAPI(messages) {
    // 从storage中获取apiKey
    const apiKey = await chrome.storage.local.get('apiKey');
    const url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    const headers = {
        'Authorization': `Bearer ${apiKey.apiKey}`,
        'Content-Type': 'application/json'
    };
    const body = JSON.stringify({
        "model": "glm-4-plus",
        "messages": messages
    });

    console.log('start to call Chat API');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log(data.usage);
        return data.choices[0].message.content;
    } catch (error) {
        console.error('Error calling Chat API:', error);
        throw error;
    }
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
        // const analysisPrompt = singleNoteAnalysisPrompt({ context: JSON.stringify(message.data) });
        // console.log(analysisPrompt);

        // // 直接调用 callChatAPI
        // callChatAPI([{ role: 'user', content: analysisPrompt }])
        //     .then(response => {
        //         console.log('Chat API response:', response);
        //         // 将response存储到noteProcessed数组中
        //         try {
        //             response = convertTableToJson(response);
        //         } catch (error) {
        //             console.error('Error converting table to JSON:', error);
        //             return;
        //         }
        //         chrome.storage.local.get('noteProcessed', (data) => {
        //             const existingProcessed = Array.isArray(data.noteProcessed) ? data.noteProcessed : [];
        //             existingProcessed.push(response);
        //             chrome.storage.local.set({ noteProcessed: existingProcessed }, function () {
        //                 console.log('Note processed saved:', existingProcessed.length);
        //             });
        //         });
        //     })
        //     .catch(error => {
        //         console.error('Error calling Chat API:', error);
        //     });
    }
    if (message.type === 'stopSearch') {
        chrome.storage.local.get('results', (data) => {
            const existingResults = data.results;
            const results = removeFields(existingResults);

            const analysisPrompt = allNoteAnalysisPrompt({query: existingResults[0].query,  context: JSON.stringify(results) });
            callChatAPI([{ role: 'user', content: analysisPrompt }]).then(response => {
                console.log('Chat API response:', response);
                // 将response存储到noteProcessed数组中
                
                chrome.storage.local.set({ answer: response }, function () {
                    console.log(' Answer saved');
                })
            })
        })
    }
});

