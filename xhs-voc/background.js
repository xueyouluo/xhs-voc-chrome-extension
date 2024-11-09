// 在文件顶部添加以下导入语句
import { generateReport,singleNoteAnalysisPrompt, allNoteAnalysisPrompt,adJudgePrompt, singleNoteABSAPrompt, mergeSentimentPrompt } from './prompt.js';


function convertTableToJson(markdown) {
    const cleanedMarkdown = markdown.slice(markdown.indexOf("|"), markdown.lastIndexOf("|") + 1);
    const lines = cleanedMarkdown.trim().split("\n");
    const headers = lines[0].split("|").map(h => h.trim()).filter(h => h);
    const data = lines.slice(2).map(line => {
        const values = line.split("|").map(v => v.trim()).filter(v => v);
        
        // 检查是否包含关键词
        if (values.includes("中性") || values.includes("---") || values.includes("Aspect Category")) {
            return undefined; // 丢弃该行
        }

        return headers.reduce((obj, header, index) => {
            if (header === "原声") {
                obj[header] = values[index].split("；").map(v => v.trim()); // 将“原声”按“；”分隔成数组
            } else {
                obj[header] = values[index];
            }
            return obj;
        }, {});
    }).filter(Boolean); // 移除undefined行

    //去除空字典
    const filteredData = data.filter(item => Object.keys(item).length !== 0);

    return filteredData;
}


function parseJSON(jsonString) {
    try {
        const start  = jsonString.indexOf('{');
        const end = jsonString.lastIndexOf('}') + 1;
        const jsonString2 = jsonString.substring(start, end);
        return JSON.parse(jsonString2);
    } catch (error) {
        console.error('解析 JSON 时出错:', error);
        return null;
    }
}

function getStandardCategory(category, categoryMap) {
    for (const [standardKey, synonyms] of Object.entries(categoryMap)) {
        if (synonyms.includes(category)) {
            return standardKey;
        }
    }
    // 如果没有找到匹配的类别，返回原始类别
    return "其他";
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
        // 将usage更新到storage中，如果已经存在则加总
        // usage格式为{completion_tokens: 681, prompt_tokens: 1436, total_tokens: 2117}
        chrome.storage.local.get('tokenUsage', (result) => {
            const usage = result.tokenUsage || { completion_tokens: 0, prompt_tokens: 0, total_tokens: 0 };
            const newUsage = {
                completion_tokens: usage.completion_tokens + data.usage.completion_tokens,
                prompt_tokens: usage.prompt_tokens + data.usage.prompt_tokens,
                total_tokens: usage.total_tokens + data.usage.total_tokens
            };
            chrome.storage.local.set({ tokenUsage: newUsage });
        })

        return data.choices[0].message.content;
    } catch (error) {
        console.error('Error calling Chat API:', error);
        throw error;
    }
}

let processPromises = [];

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
        const adPrompt =  adJudgePrompt({context: message.data.title + message.data.content}) // 加入prompt变量
        callChatAPI([{ role: 'user', content: adPrompt }]).then(response => {
            console.log('AD Judge API response:', response);
            //找到字符串中“标签：“，判断其后内容是否为[营销、广告、金融、优惠]之一
            const adLabel = response.match(/标签：(.*)/)?.[1];
            if (adLabel && [ '广告', '金融', '优惠'].includes(adLabel)) {
                console.log('广告标签:', adLabel);
                return;
            }
            // 使用正确导入的 singleNoteAnalysisPrompt 函数
            const analysisPrompt = singleNoteABSAPrompt({ query: message.data.query, context: JSON.stringify(message.data) });
            // console.log(analysisPrompt);

            // 直接调用 callChatAPI
            const processPromise = callChatAPI([{ role: 'user', content: analysisPrompt }])
                .then(response => {
                    console.log('Chat API response:', response);
                    
                    // 将response存储到noteProcessed数组中
                    try {
                        response = convertTableToJson(response);
                        // 加入idx
                        response = response.map(item => ({ idx: message.data.idx, ...item }));

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
                        chrome.runtime.sendMessage({ type: 'processedOne' });
                    });
                })
                .catch(error => {
                    console.error('Error calling Chat API:', error);
                });
            processPromises.push(processPromise);
        
        });
    }
    if (message.type === 'stopSearch') {
        console.log('stopSearch');
        Promise.all(processPromises).then(() => {
            console.log('All processes completed, starting merge...');
            processPromises = [];
            chrome.storage.local.get('noteProcessed', (data) => {
                const existingResults = data.noteProcessed;
                console.log(existingResults.length);
                // 将List of list变成list
                const flatResults = existingResults.flat();
                //获取Aspect Category字段的值，变成set
                let aspectCategories = new Set(flatResults.map(item => item['Aspect Category']));
                // 将set变成list
                aspectCategories = Array.from(aspectCategories);
                
                const analysisPrompt = mergeSentimentPrompt({context: JSON.stringify(aspectCategories) });
                callChatAPI([{ role: 'user', content: analysisPrompt }]).then(response => {
                    console.log('Chat API response:', response);
                    // 将response存储到noteProcessed数组中
                    const normalizedResults = parseJSON(response)
                    const standardizedOpinions = flatResults.map(opinion => ({
                        ...opinion,
                        AspectCategory: getStandardCategory(opinion['Aspect Category'], normalizedResults)
                    }));

                    // 计算所有正面评论的总数，只需计算一次
                    const totalPositiveCount = standardizedOpinions.filter(item => item.Sentiment === '正面').length;

                    // 使用 reduce 聚合各类别的正面计数和占比
                    const aspectCategoryPositiveCounts = standardizedOpinions.filter(item => item.Sentiment === '正面').reduce((acc, opinion) => {
                        const { AspectCategory, Sentiment } = opinion;

                        // 如果该类别已经计算过，直接跳过
                        if (acc.hasOwnProperty(AspectCategory)) {
                            acc[AspectCategory + '原声'].push(opinion['Opinion Expression'])
                            return acc;
                        }

                        // 计算该类别的正面评论数
                        const positiveCount = standardizedOpinions.filter(
                            item => item.AspectCategory === AspectCategory && item.Sentiment === '正面'
                        ).length;

                        if (positiveCount < 2){
                            return acc;
                        }

                        // 计算正面评论的占比
                        const positivePercent = (positiveCount / totalPositiveCount) * 100;

                        // 存储结果
                        acc[AspectCategory] = positiveCount;
                        acc[AspectCategory + '_占比'] = positivePercent.toFixed(2) + '%';
                        acc[AspectCategory + '原声'] = [opinion['Opinion Expression']];

                        return acc;
                    }, {});

                    const totalNegativeCount = standardizedOpinions.filter(item => item.Sentiment === '负面').length;
                    const aspectCategoryNegativeCounts = standardizedOpinions.filter(item => item.Sentiment === '负面').reduce((acc, opinion) => {
                        const { AspectCategory, Sentiment } = opinion;

                        // 如果该类别已经计算过，直接跳过
                        if (acc.hasOwnProperty(AspectCategory)) {
                            acc[AspectCategory + '原声'].push(opinion['Opinion Expression'])
                            return acc;
                        }

                        // 计算该类别的正面评论数
                        const negativeCount = standardizedOpinions.filter(
                            item => item.AspectCategory === AspectCategory && item.Sentiment === '负面'
                        ).length;

                        if (negativeCount < 2){
                            return acc;
                        }

                        // 计算正面评论的占比
                        const negativePercent = (negativeCount / totalNegativeCount) * 100;

                        // 存储结果
                        acc[AspectCategory] = negativeCount;
                        acc[AspectCategory + '_占比'] = negativePercent.toFixed(2) + '%';
                        acc[AspectCategory + '原声'] = [opinion['Opinion Expression']];
                        return acc;
                    },{})
                    
                    console.log('正面数量:')
                    console.log(aspectCategoryPositiveCounts);
                    console.log('负面数量:')
                    console.log(aspectCategoryNegativeCounts);
                    
                    chrome.storage.local.set({ 
                        standardizedOpinions: standardizedOpinions, 
                        normalizedResults: normalizedResults,
                        aspectCategoryPositiveCounts: aspectCategoryPositiveCounts,
                        aspectCategoryNegativeCounts: aspectCategoryNegativeCounts
                    }, function () {
                        console.log(' standardizedOpinions saved');
                        chrome.runtime.sendMessage({type: 'finishAnalysis'});
                        console.log('finishAnalysis, start to generate report...');
                        chrome.storage.local.get(['searchKeyword', 'aspectCategoryPositiveCounts', 'aspectCategoryNegativeCounts'], function (result) {
                            const searchKeyword = result.searchKeyword;
                            const aspectCategoryPositiveCounts = result.aspectCategoryPositiveCounts;
                            const aspectCategoryNegativeCounts = result.aspectCategoryNegativeCounts;
                            


                            const prompt = generateReport({query: searchKeyword, context: "正面结果:\n" + JSON.stringify(aspectCategoryPositiveCounts) + "\n负面结果:\n" + JSON.stringify(aspectCategoryNegativeCounts)});
                            callChatAPI([{"role": "user", "content": prompt}]).then(response => {
                                console.log(response);
                                chrome.storage.local.set({ report: response }, function () {
                                    console.log(' report saved');
                                    chrome.runtime.sendMessage({type: 'finishReport'});
                                })
                            })
                        })
                    })


                })
                
            })
        })

    }
    

});
