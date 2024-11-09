// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "search") {
        searchXiaoHongShu(request.keyword, request.searchNum);
    }

});

async function clickNote(idx, note, query) {
    console.log('in click note');
    let img = note.querySelector('img')
    if (img) {
        img.click()
        console.log('click image');

        // 等待内容加载
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('get note info');

        const title = document.querySelector("#detail-title") ? document.querySelector("#detail-title").innerText : '无标题';
        const desc = document.querySelector('#detail-desc') ? document.querySelector("#detail-desc").innerText : '无内容';

        // 假设 HTML 结构已经加载完毕
        const commentsContainer = document.querySelectorAll('.parent-comment');

        const commentsData = Array.from(commentsContainer).map(comment => {
            const commentItem = comment.querySelector('.comment-item');

            // 提取评论的作者、内容和日期
            const authorName = commentItem.querySelector('.author .name') ?
                commentItem.querySelector('.author .name').innerText : '未知作者';

            const contentText = commentItem.querySelector('.content .note-text span') ?
                commentItem.querySelector('.content .note-text span').innerText : '无内容';

            const date = commentItem.querySelector('.date span') ?
                commentItem.querySelector('.date span').innerText : '未知日期';

            // 获取评论的回复
            const replies = Array.from(comment.querySelectorAll('.reply-container .comment-item-sub')).map(reply => {
                const replyAuthorName = reply.querySelector('.author .name') ?
                    reply.querySelector('.author .name').innerText : '未知作者';

                const replyContentText = reply.querySelector('.content .note-text span') ?
                    reply.querySelector('.content .note-text span').innerText : '无内容';

                const replyDate = reply.querySelector('.date span') ?
                    reply.querySelector('.date span').innerText : '未知日期';

                return {
                    author: replyAuthorName,
                    content: replyContentText,
                    date: replyDate
                };
            });

            return {
                author: authorName,
                content: contentText,
                date: date,
                replies: replies
            };
        });

        try {
            document.querySelector('.close-circle').click(); // 修改为类选择器
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.log('close button not found')
        }
        console.log(title, desc, commentsData)
        chrome.runtime.sendMessage({ type: 'noteResults', data: {idx:idx, query: query, title: title, content: desc, comments: commentsData } });
    } else {
        console.log('Image not found, skipping this result')
    }
}

async function searchXiaoHongShu(keyword, searchNum) {
    console.log("Searching for:", keyword);
    console.log("Number of results:", searchNum);
    const SIZE = searchNum;

    // 在页面中查找搜索框并自动输入关键词
    let searchBox = document.querySelector('input.search-input'); // 假设搜索框的类名是 search-input
    if (searchBox) {
        searchBox.value = keyword;
        searchBox.dispatchEvent(new Event('input', { bubbles: true }));
        // 找到搜索按钮，假设搜索按钮的类名是 search-icon
        let searchButton = document.querySelector('.search-icon');
        if (searchButton) {
            searchButton.click();  // 模拟点击搜索按钮
        }

        // 等待搜索结果加载后提取内容
        await new Promise(resolve => setTimeout(resolve, 3000)); // 等待页面加载
        const visitedLinks = new Set();
        while (visitedLinks.size < SIZE) {
            let notes = document.querySelectorAll('.note-item'); // 假设笔记的类名是 note-item
            for (let note of notes) {
                let href = null
                try {
                    href = note.querySelector('a').href
                } catch (error) {
                    console.log('no href found')
                    continue
                }
                if (href && !visitedLinks.has(href)) {
                    visitedLinks.add(href)
                    console.log(visitedLinks.size, href)
                    await clickNote(visitedLinks.size, note, keyword);

                }
                if (visitedLinks.size >= SIZE) {
                    break
                }
            }
            window.scrollBy(0, window.innerHeight * 2); // 下翻两个屏幕的高度
            console.log('scrolling...')
            console.log('visitedLinks size:' ,visitedLinks.size)
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        chrome.runtime.sendMessage({ type: 'stopSearch' });
        // chrome.runtime.sendMessage({ type: 'noteResults', data: {end: true, size:visitedLinks.size} });

    } else {
        console.log("Search box not found");
    }
}


console.log("Content script injected successfully!");

// 测试
// (async function() {
//     try {
//         const result = await callChatAPI([{role: 'user', content: '你好'}]);
//         console.log(result);
//     } catch (error) {
//         console.error('Error calling Chat API:', error);
//     }
// })();
