
function Audit_log_(user, action, entity, entityId, meta) {
  try {
    DB_insert(SHEETS.AUDIT, {
      user_id: (user && user.id) || '',
      action: String(action || ''),
      entity: String(entity || ''),
      entity_id: String(entityId || ''),
      meta: meta ? JSON.stringify(meta) : ''
    });
  } catch (e) {}
}

function Audit_list(user, p) {
  Auth_requireCap(user, 'audit.manage');
  var data = p || {};
  var rows = DB_readAll(SHEETS.AUDIT);
  var users = DB_buildIndex(SHEETS.USERS);
  if (data.user_id) rows = rows.filter(function (r) { return String(r.user_id) === String(data.user_id); });
  if (data.action) rows = rows.filter(function (r) { return r.action.indexOf(data.action) === 0; });
  if (data.entity) rows = rows.filter(function (r) { return r.entity === data.entity; });
  rows.sort(function (a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });
  var page = Math.max(1, Number(data.page || 1));
  var per = Math.min(200, Math.max(10, Number(data.per_page || 50)));
  var total = rows.length;
  var slice = rows.slice((page-1)*per, page*per).map(function (r) {
    var u = users[r.user_id] || {};
    return {
      id: r.id, user_id: r.user_id,
      user_name: u.full_name || '(ระบบ)',
      action: r.action, entity: r.entity, entity_id: r.entity_id,
      meta: r.meta, created_at: r.created_at
    };
  });
  return { items: slice, total: total, page: page, per_page: per, pages: Math.ceil(total/per) };
}
