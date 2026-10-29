/* Artalk 公开接口：浏览量、评论和文章点赞。
   只发送站点与文章标识，管理员账号始终留在 XBlog 后端。
   预览会移除配置节点，因此不会增加真实访问或提交点赞。 */
(() => {
  const node = document.getElementById("blog-comments-config");
  if (!node) return;
  let config;
  try {
    config = JSON.parse(node.textContent || "{}");
  } catch {
    return;
  }
  if (!config.server || !config.site || !config.pageKey) return;
  const endpoint = config.server.replace(/\/$/, "") + "/api/v2";
  const count = (value) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("统计数据格式不正确");
    return value;
  };
  async function request(path, body) {
    // 使用普及度更高的 AbortController，兼容没有 AbortSignal.timeout 的浏览器。
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(endpoint + path, {
        method: body === undefined ? "GET" : "POST",
        headers:
          body === undefined
            ? { Accept: "application/json" }
            : { "Content-Type": "application/json", Accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        // 不自动重试投票 POST：响应丢失时服务端可能已经保存，再发一次会取消点赞。
        throw new Error(
          response.status === 429 || response.status === 403
            ? "操作频繁或服务限制，请稍后重试"
            : "互动服务暂时不可用",
        );
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  // 开启点赞也需登记真实访问，以便 Artalk 为新文章创建页面记录。
  // 每次打开文章只请求一次；views 关闭时仍不展示阅读数，评论组件也不重复增加 PV。
  const visit =
    config.views || config.likes
      ? request("/pages/pv", {
          page_key: config.pageKey,
          page_title: config.pageTitle,
          site_name: config.site,
        })
          .then((data) => {
            const real = count(data.pv);
            if (config.views) {
              const displayed = count(real + count(config.viewsBase ?? 0));
              const counter = document.getElementById("page-views");
              if (counter) counter.textContent = displayed.toLocaleString("zh-CN");
            }
          })
          .catch(() => {
            // 失败保留未知占位，不能把基数当作真实统计结果，也不能阻断正文阅读。
          })
      : Promise.resolve();

  const button = document.getElementById("page-like");
  if (!config.likes || !button) return;
  const label = document.getElementById("page-like-label");
  const counter = document.getElementById("page-like-count");
  const message = document.getElementById("page-like-message");
  let pageID = 0,
    ready = false,
    busy = false;
  function showVote(data) {
    const up = count(data.up);
    if (typeof data.is_up !== "boolean") throw new Error("点赞数据格式不正确");
    counter.textContent = up.toLocaleString("zh-CN");
    label.textContent = data.is_up ? "已点赞" : "点赞";
    button.setAttribute("aria-pressed", String(data.is_up));
    button.setAttribute(
      "aria-label",
      `${data.is_up ? "取消点赞" : "点赞"}，共 ${up.toLocaleString("zh-CN")} 个赞`,
    );
    message.textContent = "";
    ready = true;
  }
  async function loadVote() {
    if (!pageID) {
      const query = new URLSearchParams({
        page_key: config.pageKey,
        site_name: config.site,
        limit: "1",
        flat_mode: "true",
      });
      const data = await request("/comments?" + query);
      if (
        !data.page ||
        !Number.isSafeInteger(data.page.id) ||
        data.page.id <= 0 ||
        data.page.key !== config.pageKey ||
        data.page.site_name !== config.site
      ) {
        throw new Error("点赞记录尚未就绪，请刷新页面后重试");
      }
      pageID = data.page.id;
    }
    showVote(await request(`/votes/page/${pageID}`));
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      await action();
    } catch (error) {
      ready = false;
      label.textContent = "重新获取";
      message.textContent = `${error.message || "点赞暂时不可用"}，点击重新获取状态。`;
    } finally {
      busy = false;
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
    }
  }
  button.addEventListener("click", () =>
    run(async () => {
      if (!ready) {
        await loadVote();
        return;
      }
      // Artalk 按访客来源去重，同一文章再次投赞成票即取消；使用服务端返回值，不在本地累加。
      showVote(await request(`/votes/page/${pageID}/up`, {}));
    }),
  );
  void run(async () => {
    await visit;
    await loadVote();
  });
})();
