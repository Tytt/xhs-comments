// 小红书评论采集工具
class XHSCommentCollector {
  constructor() {
    this.comments = [];
    this.isCollecting = false;
    this.forceStop = false;
    this.totalComments = 0;
    this.init();
  }

  resetState() {
    this.comments = [];
    this.isCollecting = false;
    this.totalComments = 0;
    this.forceStop = false;
    console.log('采集器状态已重置。');
  }

  init() {
    // 等待页面加载完成后再注入按钮
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.checkForNoteDetail());
    } else {
      this.checkForNoteDetail();
    }
    
    // 监听DOM变化，检测日记弹窗的打开和关闭
    this.observeNoteDetail();
  }

  checkForNoteDetail() {
    const noteDetailMask = document.querySelector('.note-detail-mask');
    if (noteDetailMask) {
      this.injectButton();
    }
  }

  observeNoteDetail() {
    // 使用 MutationObserver 监听 DOM 变化
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // 检查是否有日记弹窗出现
          const noteDetailMask = document.querySelector('.note-detail-mask');
          const existingButton = document.getElementById('xhs-comment-collector-btn');
          
          if (noteDetailMask && !existingButton) {
            // 日记弹窗出现，注入按钮
            this.resetState(); // 每次打开新日记都重置状态
            setTimeout(() => this.injectButton(), 500);
          } else if (!noteDetailMask && existingButton) {
            // 日记弹窗消失，移除按钮，并重置采集器状态
            existingButton.remove();
            console.log('日记弹窗关闭，移除采集按钮并重置状态。');
            if (this.isCollecting) {
              this.forceStop = true; // Signal running process to stop
            }
            this.resetState();
          }
        }
      });
    });

    // 开始观察整个文档的变化
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  injectButton() {
    // 检查是否已经注入过按钮
    if (document.getElementById('xhs-comment-collector-btn')) {
      return;
    }

    // 查找日记弹窗
    const noteDetailMask = document.querySelector('.note-detail-mask');
    if (!noteDetailMask) {
      console.log('未找到日记弹窗，跳过按钮注入');
      return;
    }

    // 获取总评论数量
    const totalComments = this.getTotalCommentCount();
    
    // 创建采集按钮
    const button = document.createElement('button');
    button.id = 'xhs-comment-collector-btn';
    button.className = 'xhs-collector-btn';
    button.innerHTML = totalComments > 0 ? 
      `📝 采集评论 (0/${totalComments})` : '📝 采集评论';
    button.title = '点击采集当前日记的所有评论';
    
    // 绑定点击事件
    button.addEventListener('click', () => this.handleButtonClick());
    
    // 将按钮添加到日记弹窗内，而不是 body
    noteDetailMask.appendChild(button);
    
    console.log('小红书评论采集工具已加载到日记弹窗');
  }

  handleButtonClick() {
    if (this.isCollecting) {
      this.stopCollection();
    } else {
      this.collectComments();
    }
  }

  stopCollection() {
    if (this.isCollecting) {
      this.forceStop = true;
      this.updateButtonState('📝 正在停止...', true, false);
      this.showMessage('采集将在当前操作完成后停止。', 'info');
    }
  }

  async collectComments() {
    this.isCollecting = true;
    this.forceStop = false;
    this.comments = [];
    
    try {
      // 准备阶段
      this.totalComments = this.getTotalCommentCount();
      this.updateButtonState('📝 点击停止采集...', false, true); // 采集时按钮可点击，用于停止
      
      await this.delay(500);
      if (this.forceStop) return;

      // 滚动到评论区域
      this.updateButtonState('📝 定位评论区...', false, true);
      await this.scrollToComments();
      if (this.forceStop) return;
      
      // 加载更多评论
      this.updateButtonState('📝 加载新评论...', false, true);
      await this.loadMoreComments();
      if (this.forceStop) return;
      
      // 提取评论数据
      this.updateButtonState('📝 提取数据中...', false, true);
      await this.extractComments();
      if (this.forceStop) return;
      
      // 导出评论
      if (this.comments.length > 0) {
        await this.exportComments();
        
        // 检查是否采集完全
        const noteDetailMask = document.querySelector('.note-detail-mask');
        const hasEndMarker = noteDetailMask && this.checkIfReachedEnd(noteDetailMask);
        const actualTotal = noteDetailMask ? this.getCurrentCommentCount(noteDetailMask) : 0;
        const isComplete = (this.totalComments > 0 && this.comments.length >= this.totalComments) || 
                          (hasEndMarker && this.comments.length >= actualTotal);
        
        let message = `成功采集 ${this.comments.length} 条评论并导出`;
        if (isComplete) {
          message += ' ✅ 完整采集';
        } else if (this.totalComments > 0) {
          const completionRate = Math.round((this.comments.length / this.totalComments) * 100);
          message += ` (${completionRate}% - ${this.comments.length}/${this.totalComments})`;
        } else {
          message += ` (实际发现 ${actualTotal} 条)`;
        }
        
        this.showMessage(message, isComplete ? 'success' : 'warning');
      } else {
        if (!this.forceStop) this.showMessage('未找到评论数据', 'warning');
      }
      
    } catch (error) {
      console.error('采集评论失败:', error);
      this.showMessage('采集评论失败: ' + error.message, 'error');
    } finally {
      const wasStoppedByUser = this.forceStop;
      this.isCollecting = false;
      this.forceStop = false;

      if (wasStoppedByUser) {
        this.showMessage(`采集已停止，共保存 ${this.comments.length} 条评论。`, 'info');
        const finalText = `✖️ 采集已停止 (${this.comments.length})`;
        this.updateButtonState(finalText, false, false);
      } else {
        // 采集自然结束，检查完整性
        const noteDetailMask = document.querySelector('.note-detail-mask');
        const hasEndMarker = noteDetailMask && this.checkIfReachedEnd(noteDetailMask);
        const actualTotal = noteDetailMask ? this.getCurrentCommentCount(noteDetailMask) : this.comments.length;
        
        // 重新定义更严格的完整性检查
        const isComplete = hasEndMarker || (this.totalComments > 0 && actualTotal >= this.totalComments);

        let finalText = '';
        if (isComplete) {
            finalText = `✅ 采集完成 (${this.comments.length})`;
        } else {
            finalText = `⚠️ 部分采集 (${this.comments.length}/${this.totalComments || '?'})`;
        }
        this.updateButtonState(finalText, false, false);
      }
      
      // 4秒后恢复初始状态
      setTimeout(() => {
        const button = document.getElementById('xhs-comment-collector-btn');
        // 检查按钮是否存在且没有新的采集任务开始
        if (button && !this.isCollecting) {
          const currentTotal = this.getTotalCommentCount();
          const resetText = currentTotal > 0 ? 
            `📝 采集评论 (0/${currentTotal})` : '📝 采集评论';
          this.updateButtonState(resetText, false, false);
        }
      }, 4000);
    }
  }

  getTotalCommentCount() {
    // 查找日记弹窗内的总评论数量
    const noteDetailMask = document.querySelector('.note-detail-mask');
    if (!noteDetailMask) {
      return 0;
    }
    
    // 查找总评论数量的选择器
    const totalSelectors = [
      '.total',
      '[class*="total"]',
      '.comment-count',
      '.comments-count',
      '.total-comments',
      '[class*="comment-count"]'
    ];
    
    for (const selector of totalSelectors) {
      const totalEl = noteDetailMask.querySelector(selector);
      if (totalEl) {
        const text = totalEl.textContent;
        // 提取数字，如 "共 72 条评论" 中的 72
        const match = text.match(/共?\s*(\d+)\s*条?/);
        if (match) {
          return parseInt(match[1]);
        }
      }
    }
    
    // 如果没有找到，尝试查找包含"条评论"的元素
    const allElements = noteDetailMask.querySelectorAll('*');
    for (const element of allElements) {
      const text = element.textContent;
      if (text && (text.includes('条评论') || text.includes('条回复'))) {
        // 匹配各种格式：共 905 条评论、905 条评论、905条评论等
        const match = text.match(/共?\s*(\d+)\s*条/);
        if (match) {
          console.log(`找到评论总数: ${match[1]}, 来源文本: "${text}"`);
          return parseInt(match[1]);
        }
      }
    }
    
    // 最后尝试搜索包含纯数字的元素（如果数字很大，可能是评论数）
    for (const element of allElements) {
      const text = element.textContent?.trim();
      if (text && /^\d+$/.test(text)) {
        const num = parseInt(text);
        // 如果数字在合理范围内（通常评论数会比较大）
        if (num >= 10 && num <= 100000) {
          // 检查父元素是否包含评论相关文字
          const parent = element.parentElement;
          if (parent && (parent.textContent.includes('评论') || parent.textContent.includes('回复'))) {
            console.log(`通过数字推测评论总数: ${num}, 来源文本: "${parent.textContent}"`);
            return num;
          }
        }
      }
    }
    
    return 0;
  }

  async scrollToComments() {
    // 查找日记弹窗
    const noteDetailMask = document.querySelector('.note-detail-mask');
    if (!noteDetailMask) {
      console.log('未找到日记弹窗，无法滚动到评论');
      return;
    }
    
    // 在日记弹窗内查找评论区域
    const commentSelectors = [
      '.comments-el',
      '.interaction-container .comments-el',
      '.note-scroller .comments-el',
      '.comments-container',
      '.comment-list',
      '.list-container'
    ];
    
    let commentSection = null;
    for (const selector of commentSelectors) {
      commentSection = noteDetailMask.querySelector(selector);
      if (commentSection) {
        console.log(`找到评论区域，使用选择器: ${selector}`);
        break;
      }
    }
    
    if (commentSection) {
      // 在日记弹窗内滚动到评论区域
      const scrollableContainer = noteDetailMask.querySelector('.note-scroller') || 
                                  noteDetailMask.querySelector('.interaction-container') ||
                                  noteDetailMask;
      
      if (scrollableContainer.scrollTop !== undefined) {
        scrollableContainer.scrollTop = commentSection.offsetTop;
      } else {
        scrollableContainer.scrollTo(0, commentSection.offsetTop);
      }
      await this.delay(1500);
    } else {
      // 如果找不到评论区域，尝试滚动到弹窗下方
      console.log('未找到评论区域，滚动到弹窗下方');
      const scrollableContainer = noteDetailMask.querySelector('.note-scroller') || noteDetailMask;
      
      if (scrollableContainer.scrollTop !== undefined) {
        scrollableContainer.scrollTop = scrollableContainer.scrollHeight * 0.7;
      } else {
        scrollableContainer.scrollTo(0, scrollableContainer.scrollHeight * 0.7);
      }
      await this.delay(1500);
    }
  }

  async loadMoreComments() {
    const maxAttempts = 50; // 最大连续失败尝试次数
    let attempts = 0; // 连续失败计数器
    let expandAttempts = 0;
    
    const noteDetailMask = document.querySelector('.note-detail-mask');
    if (!noteDetailMask) {
      console.log('未找到日记弹窗，无法加载更多评论');
      return;
    }
    
    const scrollableContainer = noteDetailMask.querySelector('.note-scroller') || 
                                noteDetailMask.querySelector('.interaction-container') ||
                                noteDetailMask;
    
    while (attempts < maxAttempts) {
      if (this.forceStop) {
        console.log('采集已停止，中断加载。');
        break;
      }
      
      const currentCount = this.getCurrentCommentCount(noteDetailMask);
      this.updateButtonState(
        `📝 加载中...(${currentCount}/${this.totalComments || '?'})`, 
        false, 
        true
      );
      
      // 优先检查完成条件
      if (this.checkIfReachedEnd(noteDetailMask)) {
        console.log('找到 "THE END" 标志，停止加载。');
        break;
      }
      if (this.totalComments > 0 && currentCount >= this.totalComments) {
        console.log('采集数量已达到总数，停止加载。');
        break;
      }

      // 第一步：查找并展开所有可见的"展开回复"按钮
      const showMoreBtns = this.getVisibleShowMoreButtons(noteDetailMask);
      if (showMoreBtns.length > 0) {
        console.log(`发现 ${showMoreBtns.length} 个"展开回复"按钮，正在处理...`);
        await this.scrollToElement(showMoreBtns[0], scrollableContainer);
        await this.delay(500);
        showMoreBtns[0].click();
        expandAttempts++;
        await this.delay(2000); // 等待回复加载
        attempts = 0; // 成功操作，重置失败计数器
        continue; // 重新开始循环，继续检查
      }

      // 第二步：如果没有可展开的按钮，则滚动页面
      const beforeHeight = scrollableContainer.scrollHeight;
      
      await this.scrollToBottom(scrollableContainer);
      
      const afterHeight = scrollableContainer.scrollHeight;
      
      if (beforeHeight === afterHeight) {
        console.log("滚动到底部但未加载新内容，增加失败计数。");
        attempts++; // 滚动无效，增加失败计数
        await this.delay(1000); // 等待一下再尝试
      } else {
        console.log("滚动成功，加载了新内容。");
        attempts = 0; // 滚动成功，重置失败计数器
      }
    }
    
    if (attempts >= maxAttempts) {
        console.warn('达到最大失败尝试次数，加载过程终止。');
    }
  }

  getCurrentCommentCount(noteDetailMask) {
    // 计算所有评论（包括主评论和子评论）
    const mainComments = noteDetailMask.querySelectorAll('.comment-item:not(.comment-item-sub)').length;
    const subComments = noteDetailMask.querySelectorAll('.comment-item-sub').length;
    return mainComments + subComments;
  }

  getVisibleShowMoreButtons(noteDetailMask) {
    // 查找所有"展开更多回复"按钮
    const showMoreBtns = noteDetailMask.querySelectorAll('.show-more');
    const visibleBtns = [];
    
    for (const btn of showMoreBtns) {
      if (btn && btn.offsetParent !== null && btn.style.display !== 'none') {
        const text = btn.textContent.trim();
        // 只处理包含"展开"、"条回复"等关键词的按钮
        if (text.includes('展开') || text.includes('条回复') || text.includes('回复')) {
          visibleBtns.push(btn);
        }
      }
    }
    
    return visibleBtns;
  }

  isElementInViewport(element, container) {
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    return (
      elementRect.top >= containerRect.top &&
      elementRect.bottom <= containerRect.bottom &&
      elementRect.left >= containerRect.left &&
      elementRect.right <= containerRect.right
    );
  }

  async scrollToElement(element, container) {
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    // 计算需要滚动的距离，让元素在容器中央
    const scrollOffset = elementRect.top - containerRect.top - containerRect.height / 2;
    
    if (Math.abs(scrollOffset) > 10) { // 如果需要滚动
      container.scrollBy({
        top: scrollOffset,
        behavior: 'smooth'
      });
      await this.delay(800); // 等待滚动完成
    }
  }

  async scrollToBottom(container) {
    const targetY = container.scrollHeight;
    console.log(`滚动到底部: 从 ${container.scrollTop} 到 ${targetY}`);
    container.scrollTo({
      top: targetY,
      behavior: 'smooth'
    });
    // 等待滚动动画 (smooth behavior) 和内容加载
    await this.delay(1200);
  }

  checkIfReachedEnd(noteDetailMask) {
    // 检查是否出现了"- THE END -"元素
    const endContainer = noteDetailMask.querySelector('.end-container');
    if (endContainer) {
      const text = endContainer.textContent || '';
      if (text.includes('THE END') || text.includes('到底了') || text.includes('没有更多')) {
        return true;
      }
    }
    
    // 检查是否出现了其他可能的结束标志
    const endSelectors = [
      '[class*="end"]',
      '[class*="bottom"]',
      '[class*="finish"]',
      '[class*="complete"]'
    ];
    
    for (const selector of endSelectors) {
      const element = noteDetailMask.querySelector(selector);
      if (element) {
        const text = element.textContent || '';
        if (text.includes('THE END') || text.includes('到底了') || text.includes('没有更多')) {
          return true;
        }
      }
    }
    
    return false;
  }

  smoothScrollDown(container, distance) {
    return new Promise((resolve) => {
      const startPos = container.scrollTop;
      const targetPos = Math.min(startPos + distance, container.scrollHeight - container.clientHeight);
      const duration = 800; // 滚动持续时间（毫秒）
      const startTime = Date.now();
      
      const scroll = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // 使用缓动函数（easeInOutQuad）
        const easeProgress = progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        const currentPos = startPos + (targetPos - startPos) * easeProgress;
        container.scrollTop = currentPos;
        
        if (progress < 1) {
          requestAnimationFrame(scroll);
        } else {
          resolve();
        }
      };
      
      requestAnimationFrame(scroll);
    });
  }

  async extractComments() {
    const noteDetailMask = document.querySelector('.note-detail-mask');
    if (!noteDetailMask) {
      throw new Error('未找到日记弹窗，无法提取评论');
    }
    
    // 根据小红书实际DOM结构的评论选择器
    const commentSelectors = [
      '.comments-el .list-container .comment-item',
      '.list-container .comment-item', 
      '.comment-item',
      '.parent-comment .comment-item',
      '.comments-container .comment-item'
    ];

    let commentElements = [];
    
    // 在日记弹窗内尝试不同的选择器
    for (const selector of commentSelectors) {
      commentElements = noteDetailMask.querySelectorAll(selector);
      if (commentElements.length > 0) {
        console.log(`找到 ${commentElements.length} 条评论，使用选择器: ${selector}`);
        break;
      }
    }

    if (commentElements.length === 0) {
      // 尝试更通用的方法查找评论
      const fallbackSelectors = [
        'div:contains("回复")',
        'div:contains("赞")',
        'div:contains("小时前")',
        'div:contains("天前")',
        'div:contains("分钟前")'
      ];
      
      // 简单的文本搜索 - 只在日记弹窗内搜索
      const allDivs = noteDetailMask.querySelectorAll('div');
      const potentialComments = [];
      
      allDivs.forEach(div => {
        const text = div.textContent || '';
        if (text.includes('回复') || text.includes('赞') || 
            text.includes('小时前') || text.includes('天前') || 
            text.includes('分钟前')) {
          // 检查是否是评论相关的元素
          const hasUserInfo = div.querySelector('img') || text.length > 10;
          if (hasUserInfo) {
            potentialComments.push(div);
          }
        }
      });
      
      if (potentialComments.length > 0) {
        commentElements = potentialComments;
        console.log(`通过文本搜索找到 ${commentElements.length} 个潜在评论元素`);
      } else {
        throw new Error('未找到评论元素，可能页面结构已更新或评论区域未加载');
      }
    }

    // 提取评论信息并实时更新按钮状态
    let processedCount = 0;
    const totalElements = commentElements.length;
    
    for (let index = 0; index < totalElements; index++) {
      if (this.forceStop) {
        console.log('采集已停止，中断提取。');
        break;
      }
      const element = commentElements[index];
      try {
        const comment = this.extractCommentData(element, index);
        if (comment.content || (comment.pictures && comment.pictures.length > 0)) {
          this.comments.push(comment);
        }
        
        processedCount++;
        
        // 每处理10条或最后一条时更新状态
        if (processedCount % 10 === 0 || processedCount === totalElements) {
          this.updateButtonState(
            `📝 提取中... (${this.comments.length}条有效/${processedCount}条处理)`, 
            false,
            true
          );
          
          // 让UI有时间更新
          if (processedCount % 50 === 0) {
            await this.delay(100);
          }
        }
      } catch (error) {
        console.warn(`提取第 ${index + 1} 条评论失败:`, error);
        processedCount++;
      }
    }
    
    console.log(`提取完成: 总处理 ${processedCount} 条元素，有效评论 ${this.comments.length} 条`);
  }

  extractCommentData(element, index) {
    const isSubComment = element.classList.contains('comment-item-sub');
    
    const comment = {
      id: index + 1,
      username: '',
      content: '',
      time: '',
      likes: 0,
      replies: 0,
      avatar: '',
      location: '',
      isSubComment: isSubComment,
      commentId: element.id || '',
      pictures: []
    };

    // 提取用户名 - 根据实际HTML结构
    const usernameEl = element.querySelector('.right .author .name');
    if (usernameEl) {
      comment.username = usernameEl.textContent.trim();
    }

    // 提取评论内容 - 处理文字和表情
    const contentEl = element.querySelector('.content .note-text');
    if (contentEl) {
      let content = '';
      
      // 遍历所有子节点，包括文字和表情
      for (const node of contentEl.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          content += node.textContent;
        } else if (node.nodeName === 'SPAN') {
          content += node.textContent;
        } else if (node.nodeName === 'IMG' && node.classList.contains('note-content-emoji')) {
          content += '[表情]'; // 用文字代替表情
        }
      }
      
      comment.content = content.trim();
    }

    // 如果还是没有内容，尝试其他方法
    if (!comment.content) {
      const fallbackContent = element.querySelector('.content');
      if (fallbackContent) {
        comment.content = fallbackContent.textContent.trim().replace(/\s+/g, ' ');
      }
    }

    // 提取时间
    const timeEl = element.querySelector('.info .date span');
    if (timeEl) {
      comment.time = timeEl.textContent.trim();
    }

    // 提取地理位置
    const locationEl = element.querySelector('.info .date .location');
    if (locationEl) {
      comment.location = locationEl.textContent.trim();
    }

    // 提取点赞数
    const likeEl = element.querySelector('.interactions .like .count');
    if (likeEl) {
      const likeText = likeEl.textContent.trim();
      if (likeText === '赞') {
        comment.likes = 0;
      } else {
        const likeNumber = parseInt(likeText);
        if (!isNaN(likeNumber)) {
          comment.likes = likeNumber;
        }
      }
    }

    // 提取回复数
    const replyEl = element.querySelector('.interactions .reply .count');
    if (replyEl) {
      const replyText = replyEl.textContent.trim();
      if (replyText !== '回复') {
        const replyNumber = parseInt(replyText);
        if (!isNaN(replyNumber)) {
          comment.replies = replyNumber;
        }
      }
    }

    // 提取头像
    const avatarEl = element.querySelector('.avatar img');
    if (avatarEl && avatarEl.src) {
      comment.avatar = avatarEl.src;
    }

    // 提取图片评论
    const pictureEl = element.querySelector('.comment-picture img');
    if (pictureEl && pictureEl.src) {
      comment.pictures.push(pictureEl.src);
    }

    return comment;
  }

  getTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (text && text.length > 2) {
        textNodes.push(text);
      }
    }

    return textNodes;
  }

  async exportComments() {
    const timestamp = new Date().toISOString().split('T')[0];
    const pageTitle = document.title.replace(/[^\w\s]/gi, '') || '小红书评论';
    const filename = `${pageTitle}_评论_${timestamp}.json`;

    // 检查采集状态
    const noteDetailMask = document.querySelector('.note-detail-mask');
    const hasEndMarker = noteDetailMask && this.checkIfReachedEnd(noteDetailMask);
    const actualTotal = noteDetailMask ? this.getCurrentCommentCount(noteDetailMask) : 0;
    const isComplete = (this.totalComments > 0 && this.comments.length >= this.totalComments) || 
                      (hasEndMarker && this.comments.length >= actualTotal);

    const exportData = {
      exportTime: new Date().toISOString(),
      pageUrl: window.location.href,
      pageTitle: document.title,
      collectedComments: this.comments.length,
      expectedTotal: this.totalComments || 0,
      actualTotal: actualTotal,
      completionRate: this.totalComments > 0 ? Math.round((this.comments.length / this.totalComments) * 100) : 0,
      isComplete: isComplete,
      hasEndMarker: hasEndMarker,
      status: isComplete ? 'complete' : 'partial',
      statistics: {
        mainComments: this.comments.filter(c => !c.isSubComment).length,
        subComments: this.comments.filter(c => c.isSubComment).length,
        commentsWithPictures: this.comments.filter(c => c.pictures && c.pictures.length > 0).length,
        totalLikes: this.comments.reduce((sum, c) => sum + (c.likes || 0), 0),
        avgLikes: this.comments.length > 0 ? Math.round(this.comments.reduce((sum, c) => sum + (c.likes || 0), 0) / this.comments.length) : 0
      },
      comments: this.comments
    };

    // 创建并下载文件
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json;charset=utf-8' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 同时导出CSV格式
    await this.exportCommentsCSV(pageTitle, timestamp);
  }

  async exportCommentsCSV(pageTitle, timestamp) {
    const filename = `${pageTitle}_评论_${timestamp}.csv`;
    
    // CSV头部
    const headers = ['序号', '用户名', '评论内容', '时间', '点赞数', '回复数'];
    const csvContent = [
      headers.join(','),
      ...this.comments.map(comment => [
        comment.id,
        `"${comment.username.replace(/"/g, '""')}"`,
        `"${comment.content.replace(/"/g, '""')}"`,
        `"${comment.time.replace(/"/g, '""')}"`,
        comment.likes,
        comment.replies
      ].join(','))
    ].join('\n');

    // 添加BOM以支持中文
    const blob = new Blob(['\ufeff' + csvContent], { 
      type: 'text/csv;charset=utf-8' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  updateButtonState(text, disabled, isLoading = false) {
    const button = document.getElementById('xhs-comment-collector-btn');
    if (button) {
      button.innerHTML = text;
      button.disabled = disabled;
      
      // 添加或移除加载动画
      if (isLoading) {
        button.classList.add('loading');
      } else {
        button.classList.remove('loading');
      }
    }
  }

  showMessage(message, type = 'info') {
    // 移除之前的消息
    const existingMessage = document.getElementById('xhs-collector-message');
    if (existingMessage) {
      existingMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.id = 'xhs-collector-message';
    messageDiv.className = `xhs-collector-message ${type}`;
    messageDiv.textContent = message;
    
    // 添加到日记弹窗内，如果存在的话
    const noteDetailMask = document.querySelector('.note-detail-mask');
    if (noteDetailMask) {
      noteDetailMask.appendChild(messageDiv);
    } else {
      document.body.appendChild(messageDiv);
    }
    
    // 3秒后自动消失
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.remove();
      }
    }, 3000);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 初始化采集器
const collector = new XHSCommentCollector(); 