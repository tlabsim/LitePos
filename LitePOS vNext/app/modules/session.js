// app/modules/session.js
(function () {
    window.LitePos = window.LitePos || {};
    const ns = window.LitePos;
    ns.api = ns.api || {};
    ns.state = ns.state || {};

    const SESSION_KEY = 'litepos_bdt_session_v1';
    ns.api.SESSION_KEY = SESSION_KEY;

    ns.api.loadSession = function () {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    };

    ns.api.saveSession = function (session) {
        if (!session) {
            localStorage.removeItem(SESSION_KEY);
            ns.state.session = null;
        } else {
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
            ns.state.session = session;
        }
    };

    ns.api.initSession = function () {
        const session = ns.api.loadSession();
        if (!session) return null;
        if (!ns.state.db) return null;
        const user = ns.state.db.users && ns.state.db.users.find(u => u.id === session.userId);
        if (user) {
            ns.state.currentUser = user;
            ns.state.session = session;
            return user;
        }
        ns.api.saveSession(null);
        return null;
    };

})();
