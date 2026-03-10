/* learning-kit/templates/td-exercice/section-utils.js */
(function () {
    'use strict';

    // ── Solution toggles ──────────────────────────────────────────────────
    // Le bouton .solution-btn doit être immédiatement suivi du div .solution
    document.querySelectorAll('.solution-btn').forEach(btn => {
        const solution = btn.nextElementSibling;
        if (!solution?.classList.contains('solution')) return;

        btn.setAttribute('aria-expanded', 'false');

        btn.addEventListener('click', () => {
            const isVisible = solution.classList.contains('solution--visible');
            solution.classList.toggle('solution--visible', !isVisible);
            btn.setAttribute('aria-expanded', String(!isVisible));

            const label = btn.querySelector('.btn-label');
            if (label) label.textContent = isVisible ? 'Voir la solution' : 'Masquer la solution';

            // Notifier index.html (progress tracking)
            if (!isVisible) {
                window.parent.postMessage(
                    { type: 'solution-revealed', href: window.location.href },
                    '*'
                );
            }
        });
    });

    // ── Hints progressifs — déverrouillage séquentiel ────────────────────
    // Structure attendue dans le HTML :
    //   <button class="hint-btn" data-hint="id-hint-1">…</button>
    //   <div class="hint" id="id-hint-1">…</div>
    //   <button class="hint-btn hint-locked" data-hint="id-hint-2">…</button>
    //   <div class="hint" id="id-hint-2">…</div>
    document.querySelectorAll('.hint-btn:not(.hint-locked)').forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');
        attachHintListener(btn);
    });

    function attachHintListener(btn) {
        btn.addEventListener('click', () => {
            const hintId = btn.dataset.hint;
            const hint   = hintId ? document.getElementById(hintId) : btn.nextElementSibling;
            if (!hint) return;

            const isVisible = hint.classList.contains('hint--visible');
            hint.classList.toggle('hint--visible', !isVisible);
            btn.setAttribute('aria-expanded', String(!isVisible));

            const label = btn.querySelector('.btn-label');
            if (label) {
                const openLabel = btn.dataset.label || label.textContent || 'Indice';
                const closeLabel = btn.dataset.closeLabel || 'Masquer l\'indice';
                label.textContent = isVisible ? openLabel : closeLabel;
            }

            // Déverrouiller le prochain indice après avoir révélé celui-ci
            if (!isVisible) unlockNextHint(hint);
        });
    }

    function unlockNextHint(hintEl) {
        let sibling = hintEl.nextElementSibling;
        while (sibling) {
            if (sibling.classList.contains('hint-btn') && sibling.classList.contains('hint-locked')) {
                sibling.classList.remove('hint-locked');
                attachHintListener(sibling);
                break;
            }
            sibling = sibling.nextElementSibling;
        }
    }

    // ── Zones de réponse éditables — auto-sauvegarde localStorage ────────
    const pageKey = window.location.pathname + window.location.search;
    let saveTimer = null;

    document.querySelectorAll('.reponse-zone[contenteditable]').forEach((zone, i) => {
        const key   = 'td_answer_' + pageKey + '_' + i;
        const saved = localStorage.getItem(key);
        if (saved) zone.innerHTML = saved;

        zone.addEventListener('input', () => {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                localStorage.setItem(key, zone.innerHTML);
                window.parent.postMessage({ type: 'answer-saved' }, '*');
            }, 800);
        });
    });

    // ── Tous les postMessages entrants — un seul listener ────────────────
    window.addEventListener('message', (e) => {

        // Révéler / masquer les solutions
        if (e.data === 'show-all-solutions' || e.data === 'hide-all-solutions') {
            const show = e.data === 'show-all-solutions';
            document.querySelectorAll('.solution').forEach(s => s.classList.toggle('solution--visible', show));
            document.querySelectorAll('.solution-btn').forEach(btn => {
                btn.setAttribute('aria-expanded', show ? 'true' : 'false');
                const label = btn.querySelector('.btn-label');
                if (label) label.textContent = show ? 'Masquer la solution' : 'Voir la solution';
            });
        }

        // Effacer les réponses
        if (e.data === 'clear-answers') {
            document.querySelectorAll('.reponse-zone[contenteditable]').forEach((zone, i) => {
                zone.innerHTML = '';
                localStorage.removeItem('td_answer_' + pageKey + '_' + i);
            });
        }

        // Exporter les réponses
        if (e.data === 'export-answers') {
            const lines = [];
            const title = document.querySelector('h2')?.textContent?.trim() || 'Exercice';
            lines.push('=== ' + title + ' ===\n');
            document.querySelectorAll('.question').forEach((q, qi) => {
                const qNum   = q.querySelector('.question-num')?.textContent?.trim() || ('Q' + (qi + 1));
                const enonce = q.querySelector('p')?.textContent?.trim() || '';
                let zoneEl   = q.nextElementSibling;
                while (zoneEl && !zoneEl.classList.contains('reponse-zone')) zoneEl = zoneEl.nextElementSibling;
                const answer = zoneEl?.innerText?.trim() || '(pas de réponse)';
                lines.push(`--- ${qNum} ---`);
                lines.push('Énoncé  : ' + enonce);
                lines.push('Réponse : ' + answer);
                lines.push('');
            });
            window.parent.postMessage({ type: 'export-data', text: lines.join('\n') }, '*');
        }
    });

    // ── Boutons copier pour les blocs <pre> ──────────────────────────────
    document.querySelectorAll('pre').forEach(pre => {
        const wrapper = document.createElement('div');
        wrapper.className = 'code-wrapper';
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);

        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = 'Copier';
        btn.addEventListener('click', () => {
            const text = pre.querySelector('code')?.innerText ?? pre.innerText;
            navigator.clipboard.writeText(text).then(() => {
                btn.textContent = 'Copié ✓';
                btn.classList.add('copied');
                setTimeout(() => { btn.textContent = 'Copier'; btn.classList.remove('copied'); }, 2000);
            });
        });
        wrapper.appendChild(btn);
    });

})();
