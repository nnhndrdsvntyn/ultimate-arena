(function () {
    let hasCrashed = false;

    function stringifyUnknown(value) {
        if (value instanceof Error) {
            return value.stack || `${value.name}: ${value.message}`;
        }
        if (typeof value === 'string') return value;
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    }

    function buildCrashText(title, details) {
        const lines = [
            title,
            '',
            `Time: ${new Date().toISOString()}`,
            `URL: ${location.href}`,
            `User Agent: ${navigator.userAgent}`,
            '',
            details
        ];
        return lines.join('\n');
    }

    function showCrashScreen(title, details) {
        if (hasCrashed) return;
        hasCrashed = true;

        const crashText = buildCrashText(title, details);

        try {
            document.documentElement.innerHTML = '';
        } catch {
            // Ignore DOM reset failures.
        }

        const head = document.head || document.createElement('head');
        const body = document.body || document.createElement('body');

        if (!document.head) document.documentElement.appendChild(head);
        if (!document.body) document.documentElement.appendChild(body);

        const style = document.createElement('style');
        style.textContent = `
            html, body {
                margin: 0;
                min-height: 100%;
                background: #0b0b0b;
                color: #f5f5f5;
                font-family: monospace;
            }
            body {
                padding: 16px;
            }
            pre {
                margin: 0;
                white-space: pre-wrap;
                word-break: break-word;
                user-select: text;
                -webkit-user-select: text;
            }
        `;
        head.appendChild(style);

        const pre = document.createElement('pre');
        pre.textContent = crashText;
        body.appendChild(pre);

        try {
            navigator.clipboard?.writeText(crashText).catch(() => {});
        } catch {
            // Ignore clipboard failures.
        }
    }

    window.__showClientCrash = function (error) {
        showCrashScreen('Client Crash', stringifyUnknown(error));
    };

    window.addEventListener('error', function (event) {
        const error = event.error;
        const details = error
            ? stringifyUnknown(error)
            : [
                event.message || 'Unknown error',
                event.filename ? `File: ${event.filename}` : '',
                Number.isFinite(event.lineno) ? `Line: ${event.lineno}` : '',
                Number.isFinite(event.colno) ? `Column: ${event.colno}` : ''
            ].filter(Boolean).join('\n');
        showCrashScreen('Client Error', details);
    });

    window.addEventListener('unhandledrejection', function (event) {
        showCrashScreen('Unhandled Promise Rejection', stringifyUnknown(event.reason));
    });
})();
