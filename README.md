# xhs-voc-chrome-extension
一个利用小红书进行VOC分析的Chrome插件

## 使用方法

- 打开chrome,进入扩展程序页面（chrome://extensions/）
- 打开开发者模式
- 点击“加载已解压的扩展程序”，选择项目目录xhs-voc
- 打开小红书网站，点击插件图标
- 注册一个智谱的账号，能够获取免费赠送的token，生成一个API Key，填入API Key点击保存
- 输入query，点击搜索，即可获得结果


## 流程

1. 用户在popup页面输入query
2. 搜索笔记
3. 爬取笔记和评论
4. 使用ABSA提取情感分析
5. Aspect聚合
6. 根据聚合结果统计正负面占比
7. 根据正负面结果生成总结