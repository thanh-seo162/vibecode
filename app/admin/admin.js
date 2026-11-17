/* ==========================================================================
   Trang quản trị Đập Chuột (A1 đăng nhập, A2 danh sách, A3 xác nhận xoá).
   Dữ liệu người chơi chỉ chèn bằng textContent, không dùng innerHTML.
   Đặc tả: docs/02 › F-23 → F-31, docs/03 › Trang quản trị, docs/04 › API.
   ========================================================================== */
(function () {
  "use strict";

  var VAL = window.DapChuotValidate;
  var $ = function (id) { return document.getElementById(id); };
  var VN_OFFSET_MS = 7 * 60 * 60 * 1000;

  var MSG = {
    bad: "Sai tên đăng nhập hoặc mật khẩu",
    locked: "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.",
    expired: "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.",
    disabled: "Trang quản trị chưa được cấu hình.",
    error: "Có lỗi xảy ra. Vui lòng thử lại.",
    network: "Không kết nối được máy chủ. Vui lòng thử lại."
  };

  var views = { loading: $("view-loading"), login: $("view-login"), list: $("view-list") };
  var el = {
    loginForm: $("login-form"), loginAlert: $("login-alert"), loginUser: $("login-user"),
    loginPass: $("login-pass"), loginBtn: $("login-btn"),
    adminName: $("admin-name"), logoutBtn: $("logout-btn"),
    search: $("search"), sort: $("sort"), csvBtn: $("csv-btn"), bulkBtn: $("bulk-delete-btn"),
    tableWrap: $("table-wrap"), rows: $("rows"), checkAll: $("check-all"), empty: $("empty"),
    summary: $("summary"), prevBtn: $("prev-btn"), nextBtn: $("next-btn"), pageInfo: $("page-info"),
    dialog: $("confirm"), dlgTitle: $("confirm-title"), dlgText: $("confirm-text"),
    dlgCancel: $("confirm-cancel"), dlgOk: $("confirm-ok"), toast: $("toast")
  };

  // ---------- Trạng thái ----------
  var params = readUrl();
  var data = { items: [], total: 0, totalAll: 0, page: 1, pageSize: 20 };
  var selected = new Set();
  var pending = null;       // việc xoá đang chờ xác nhận
  var loadSeq = 0;
  var searchTimer = null;
  var toastTimer = null;

  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
  }

  function readUrl() {
    var sp = new URLSearchParams(location.search);
    var page = parseInt(sp.get("page"), 10);
    var sort = sp.get("sort");
    return {
      q: (sp.get("q") || "").slice(0, 100),
      page: page >= 1 ? page : 1,
      sort: ["newest", "score", "name"].indexOf(sort) >= 0 ? sort : "newest"
    };
  }

  function writeUrl() {
    var sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.page > 1) sp.set("page", String(params.page));
    if (params.sort !== "newest") sp.set("sort", params.sort);
    var qs = sp.toString();
    history.replaceState(null, "", "/admin" + (qs ? "?" + qs : ""));
  }

  function query(withPage) {
    var sp = new URLSearchParams({ q: params.q, sort: params.sort });
    if (withPage) sp.set("page", String(params.page));
    return sp.toString();
  }

  /** Gọi API; trả về { status, data }. 401 ở trang danh sách → về A1 với thông báo hết phiên. */
  function api(method, url, body) {
    var opt = { method: method, headers: {}, credentials: "same-origin" };
    if (body !== undefined) {
      opt.headers["Content-Type"] = "application/json";
      opt.body = JSON.stringify(body);
    }
    return fetch(url, opt).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (d) {
        return { status: res.status, data: d };
      });
    });
  }

  function expired() { goLogin(MSG.expired); }

  // ---------- Định dạng ----------
  function pad(n) { return String(n).padStart(2, "0"); }
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
    return pad(d.getUTCDate()) + "/" + pad(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear() +
      " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes());
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 3000);
  }

  // ---------- A1 · Đăng nhập ----------
  function setLoginAlert(msg) {
    el.loginAlert.textContent = msg || "";
    el.loginAlert.hidden = !msg;
  }

  function goLogin(msg, disabled) {
    if (el.dialog.open) el.dialog.close();
    setLoginAlert(msg);
    el.loginBtn.disabled = !!disabled;
    el.loginUser.disabled = !!disabled;
    el.loginPass.disabled = !!disabled;
    show("login");
    if (!disabled) (el.loginUser.value ? el.loginPass : el.loginUser).focus();
  }

  el.loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (el.loginBtn.disabled) return;
    setLoginAlert("");
    el.loginBtn.disabled = true;
    el.loginBtn.textContent = "Đang đăng nhập…";
    api("POST", "/api/admin/login", { username: el.loginUser.value, password: el.loginPass.value })
      .then(function (r) {
        el.loginBtn.disabled = false;
        el.loginBtn.textContent = "Đăng nhập";
        if (r.status === 204) { el.loginPass.value = ""; boot(); return; }
        if (r.status === 503) { goLogin(MSG.disabled, true); return; }
        setLoginAlert(r.status === 401 ? MSG.bad : r.status === 429 ? MSG.locked : MSG.error);
        el.loginPass.value = "";
        el.loginPass.focus();
      })
      .catch(function () {
        el.loginBtn.disabled = false;
        el.loginBtn.textContent = "Đăng nhập";
        setLoginAlert(MSG.network);
      });
  });

  el.logoutBtn.addEventListener("click", function () {
    api("POST", "/api/admin/logout").finally(function () { goLogin(""); });
  });

  // ---------- A2 · Danh sách ----------
  function load() {
    var seq = ++loadSeq;
    el.tableWrap.classList.add("is-loading");
    writeUrl();
    return api("GET", "/api/admin/players?" + query(true)).then(function (r) {
      if (seq !== loadSeq) return;
      el.tableWrap.classList.remove("is-loading");
      if (r.status === 401) return expired();
      if (r.status === 503) return goLogin(MSG.disabled, true);
      if (r.status !== 200 || !r.data) return toast(MSG.error);
      data = r.data;
      // Xoá dòng cuối của trang cuối → lùi về trang trước.
      if (data.items.length === 0 && params.page > 1 && data.total > 0) {
        params.page = Math.max(1, Math.ceil(data.total / data.pageSize));
        return load();
      }
      render();
    }).catch(function () {
      if (seq !== loadSeq) return;
      el.tableWrap.classList.remove("is-loading");
      toast(MSG.network);
    });
  }

  function cell(text, cls) {
    var td = document.createElement("td");
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
  }

  function render() {
    var items = data.items;
    selected.forEach(function (id) {
      if (!items.some(function (it) { return it.id === id; })) selected.delete(id);
    });

    el.rows.textContent = "";
    items.forEach(function (it) {
      var tr = document.createElement("tr");

      var tdc = document.createElement("td");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(it.id);
      cb.setAttribute("aria-label", "Chọn " + it.fullName);
      cb.addEventListener("change", function () {
        if (cb.checked) selected.add(it.id); else selected.delete(it.id);
        updateSelection();
      });
      tdc.appendChild(cb);
      tr.appendChild(tdc);

      tr.appendChild(cell(it.fullName));
      tr.appendChild(cell(it.email));
      tr.appendChild(cell(VAL.formatPhone(it.phone), "nowrap num-text"));
      tr.appendChild(cell(String(it.bestScore), "num"));
      tr.appendChild(cell(String(it.playsCount), "num"));
      tr.appendChild(cell(fmtDate(it.createdAt), "nowrap"));
      tr.appendChild(cell(fmtDate(it.lastPlayedAt), "nowrap" + (it.lastPlayedAt ? "" : " muted")));

      var tda = document.createElement("td");
      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-danger btn-sm";
      del.textContent = "Xoá";
      del.setAttribute("aria-label", "Xoá " + it.fullName);
      del.addEventListener("click", function () { askDelete([it]); });
      tda.appendChild(del);
      tr.appendChild(tda);

      el.rows.appendChild(tr);
    });

    var hasItems = items.length > 0;
    el.tableWrap.hidden = !hasItems;
    el.empty.hidden = hasItems;
    if (!hasItems) {
      el.empty.textContent = params.q ? "Không tìm thấy người chơi phù hợp." : "Chưa có người chơi nào đăng ký.";
    }

    var pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    var from = hasItems ? (data.page - 1) * data.pageSize + 1 : 0;
    var to = hasItems ? from + items.length - 1 : 0;
    var shown = hasItems ? " · Hiển thị " + from + "–" + to : "";
    el.summary.textContent = params.q
      ? "Tìm thấy " + data.total + " kết quả cho “" + params.q + "”" + shown
      : "Tổng: " + data.totalAll + " người chơi" + shown;
    el.pageInfo.textContent = "Trang " + Math.min(params.page, pages) + " / " + pages;
    el.prevBtn.disabled = params.page <= 1;
    el.nextBtn.disabled = params.page >= pages;
    el.csvBtn.textContent = params.q ? "Xuất CSV (" + data.total + " kết quả)" : "Xuất CSV";
    updateSelection();
  }

  function updateSelection() {
    var n = selected.size;
    el.bulkBtn.hidden = n === 0;
    el.bulkBtn.textContent = "Xoá " + n + " mục đã chọn";
    var total = data.items.length;
    el.checkAll.checked = total > 0 && n === total;
    el.checkAll.indeterminate = n > 0 && n < total;
  }

  el.checkAll.addEventListener("change", function () {
    selected.clear();
    if (el.checkAll.checked) data.items.forEach(function (it) { selected.add(it.id); });
    render();
  });

  // Tìm kiếm: tự lọc sau 300ms ngừng gõ, hoặc Enter. Đổi từ khoá → về trang 1.
  function applySearch() {
    clearTimeout(searchTimer);
    var q = el.search.value.trim().slice(0, 100);
    if (q === params.q) return;
    params.q = q;
    params.page = 1;
    selected.clear();
    load();
  }
  el.search.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applySearch, 300);
  });
  el.search.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); applySearch(); }
  });

  el.sort.addEventListener("change", function () {
    params.sort = el.sort.value;
    params.page = 1;
    selected.clear();
    load();
  });

  el.prevBtn.addEventListener("click", function () {
    if (params.page > 1) { params.page--; selected.clear(); load(); }
  });
  el.nextBtn.addEventListener("click", function () {
    params.page++; selected.clear(); load();
  });

  // Xuất CSV: kiểm tra phiên trước để hết phiên thì về A1 thay vì tải file lỗi.
  el.csvBtn.addEventListener("click", function () {
    api("GET", "/api/admin/me").then(function (r) {
      if (r.status === 401) return expired();
      if (r.status !== 200) return toast(MSG.error);
      var a = document.createElement("a");
      a.href = "/api/admin/players.csv?" + query(false);
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }).catch(function () { toast(MSG.network); });
  });

  // ---------- A3 · Xoá ----------
  function askDelete(list) {
    pending = list;
    if (list.length === 1) {
      el.dlgTitle.textContent = "Xoá người chơi?";
      el.dlgText.textContent = list[0].fullName + " (" + list[0].email +
        ") sẽ bị xoá vĩnh viễn, kể cả điểm số. Không thể hoàn tác.";
    } else {
      el.dlgTitle.textContent = "Xoá " + list.length + " người chơi?";
      el.dlgText.textContent = list.length + " người chơi đã chọn sẽ bị xoá vĩnh viễn. Không thể hoàn tác.";
    }
    el.dlgOk.disabled = false;
    el.dlgOk.textContent = "Xoá";
    el.dialog.showModal();
    el.dlgCancel.focus();
  }

  el.bulkBtn.addEventListener("click", function () {
    var list = data.items.filter(function (it) { return selected.has(it.id); });
    if (list.length) askDelete(list);
  });

  el.dlgCancel.addEventListener("click", function () { el.dialog.close(); });
  el.dialog.addEventListener("close", function () { pending = null; });

  el.dlgOk.addEventListener("click", function () {
    if (!pending || el.dlgOk.disabled) return;
    var list = pending;
    el.dlgOk.disabled = true;
    el.dlgOk.textContent = "Đang xoá…";
    var req = list.length === 1
      ? api("DELETE", "/api/admin/players/" + list[0].id)
      : api("POST", "/api/admin/players/delete", { ids: list.map(function (it) { return it.id; }) });
    req.then(function (r) {
      el.dialog.close();
      if (r.status === 401) return expired();
      list.forEach(function (it) { selected.delete(it.id); });
      if (r.status === 204) toast("Đã xoá " + list[0].fullName);
      else if (r.status === 200 && r.data) toast("Đã xoá " + r.data.deleted + " người chơi");
      else if (r.status === 404) toast("Người chơi không còn tồn tại");
      else toast(MSG.error);
      load();
      el.search.focus();
    }).catch(function () {
      el.dialog.close();
      toast(MSG.network);
    });
  });

  // ---------- Khởi động ----------
  function boot() {
    api("GET", "/api/admin/me").then(function (r) {
      if (r.status === 200 && r.data) {
        el.adminName.textContent = r.data.username;
        el.search.value = params.q;
        el.sort.value = params.sort;
        show("list");
        load();
        return;
      }
      if (r.status === 503) return goLogin(MSG.disabled, true);
      goLogin("");
    }).catch(function () { goLogin(MSG.network); });
  }

  boot();
})();
