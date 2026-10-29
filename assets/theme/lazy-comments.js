/* 评论接近视口后加载；浏览量和点赞由独立的轻量脚本维护。 */
(() => {
  const configNode = document.getElementById('blog-comments-config');
  const target = document.getElementById('comments');
  const tag = document.querySelector('script[data-silu-comments]');
  if (!configNode || !target || !tag) return;
  let config;
  try { config = JSON.parse(configNode.textContent || '{}'); } catch { return; }
  if (!config.comments || !config.server || !config.site || !config.pageKey) return;
  let loading = false, complete = false;
  const status = document.createElement('p');
  status.className = 'silu-comment-status';
  status.setAttribute('role', 'status');
  const load = async () => {
    if (loading || complete) return;
    loading = true;
    status.textContent = '正在加载评论…';
    target.replaceChildren(status);
    try {
      if (!document.querySelector('link[data-silu-artalk-style]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = tag.dataset.artalkStyle;
        css.dataset.siluArtalkStyle = '';
        document.head.append(css);
      }
      if (!window.Artalk) await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = tag.dataset.artalkSrc;
        script.onload = resolve;
        script.onerror = () => { script.remove(); reject(new Error('load failed')); };
        document.head.append(script);
      });
      if (!window.Artalk) throw new Error('unavailable');
      target.replaceChildren();
        if (config.comments && window.Artalk) {
    try {
      let comments;
      const visitorKey = "reader-comment-guest:" + config.site;
      let visitorEmail;
      const anonymousEmail = () => {
        if (visitorEmail) return visitorEmail;
        let id;
        try {
          id = localStorage.getItem(visitorKey);
        } catch {
          /* 存储受限时仅在当前页面保存。 */
        }
        if (!/^[a-f0-9]{32}$/.test(id || "")) {
          id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
            value.toString(16).padStart(2, "0"),
          ).join("");
          try {
            localStorage.setItem(visitorKey, id);
          } catch {
            /* 不影响当前页面评论。 */
          }
        }
        // Artalk 2.10 的公开接口要求邮箱格式；保留域 .invalid 不代表真实邮箱，也不用于登录。
        visitorEmail = `visitor-${id}@guest.invalid`;
        return visitorEmail;
      };
      let preparing = false;
      const prepareNickname = (editor, validate = false) => {
        if (!comments?.ctx?.inject || preparing) return true;
        const inputs = editor.getHeaderInputEls();
        const user = comments.ctx.inject("user");
        const current = user.getData();
        for (const field of ["email", "link"]) {
          inputs[field].hidden = true;
          inputs[field].tabIndex = -1;
        }
        inputs.name.placeholder = "昵称";
        inputs.name.setAttribute("aria-label", "昵称");
        inputs.name.required = true;
        if (validate && !inputs.name.value.trim()) {
          inputs.name.setCustomValidity("请填写昵称");
          inputs.name.reportValidity();
          return false;
        }
        inputs.name.setCustomValidity("");
        // 已登录账号沿用官方身份；普通访客使用独立匿名标识，不能冒用已有邮箱的账号。
        const email = current.token ? current.email : anonymousEmail();
        preparing = true;
        try {
          if (current.email !== email || (validate && current.name !== inputs.name.value.trim())) {
            user.update(
              current.token
                ? { name: inputs.name.value.trim() }
                : { name: inputs.name.value.trim(), email, link: "", is_admin: false },
            );
          }
          inputs.email.value = email;
        } finally {
          preparing = false;
        }
        return true;
      };
      comments = window.Artalk.init({
        el: "#comments",
        server: config.server,
        site: config.site,
        pageKey: config.pageKey,
        pageTitle: config.pageTitle,
        locale: config.locale,
        pvAdd: false,
        // 选择器必须有效；阅读数由本文件统一显示，空字符串会触发 Artalk 的查询异常。
        pvEl: "[data-artalk-pv]",
        pageVote: false,
        emoticons: false,
        darkMode: document.documentElement.classList.contains("dark"),
        beforeSubmit: (editor, next) => {
          if (prepareNickname(editor, true)) next();
        },
      });
      if (comments?.ctx?.inject) {
        const editor = comments.ctx.inject("editor");
        comments.getEl().classList.add("reader-nickname-only");
        prepareNickname(editor);
        editor
          .getHeaderInputEls()
          .name.addEventListener("input", () =>
            editor.getHeaderInputEls().name.setCustomValidity(""),
          );
        comments.on("user-changed", () => prepareNickname(editor));
      }
      // 只切换评论组件的配色，不重新加载评论或登记访问量。
      // 观察根节点也能响应自定义 Header 中的主题切换，页面回退后仍然有效。
      if (typeof comments?.setDarkMode === "function" && typeof MutationObserver === "function") {
        const observer = new MutationObserver(() => {
          comments.setDarkMode(document.documentElement.classList.contains("dark"));
        });
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        });
      }
    } catch {
      document.getElementById("comments").textContent = "评论服务暂时不可用，请稍后重试。";
    }
  }


      complete = true;
    } catch {
      const retry = document.createElement('button');
      retry.type = 'button'; retry.className = 'silu-comment-retry';
      retry.textContent = '评论暂时无法加载，点击重试';
      retry.addEventListener('click', load);
      target.replaceChildren(retry);
    } finally { loading = false; }
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); }
    }, { root: document.querySelector('.page-scroll'), rootMargin: '500px 0px' });
    observer.observe(target);
  } else { void load(); }
})();
