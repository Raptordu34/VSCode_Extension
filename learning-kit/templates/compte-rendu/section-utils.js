// section-utils.js — utilitaires injectés dans chaque section

(function () {
    // ── BOUTON COPIER sur les blocs pre ──
    document.querySelectorAll('pre').forEach(pre => {
        // Wrapper pour contenir le bouton sans casser l'overflow-x du pre
        const wrapper = document.createElement('div');
        wrapper.className = 'code-wrapper';
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);

        const btn = makeBtn();
        wrapper.appendChild(btn);

        btn.addEventListener('click', () => {
            const text = (pre.querySelector('code')?.innerText ?? pre.innerText).trim();
            copy(text, btn);
        });
    });

    // ── BOUTON COPIER sur les blocs terminal ──
    document.querySelectorAll('.terminal').forEach(terminal => {
        const btn = makeBtn('copy-btn copy-btn--bar');
        terminal.appendChild(btn);

        btn.addEventListener('click', () => {
            // Récupère uniquement le texte visible (pas les span .prompt/.comment)
            const text = (terminal.querySelector('code')?.innerText ?? terminal.innerText).trim();
            copy(text, btn);
        });
    });

    function makeBtn(cls = 'copy-btn') {
        const btn = document.createElement('button');
        btn.className = cls;
        btn.textContent = 'Copier';
        return btn;
    }

    function copy(text, btn) {
        navigator.clipboard.writeText(text).then(() => {
            btn.textContent = 'Copié !';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = 'Copier';
                btn.classList.remove('copied');
            }, 2000);
        });
    }
})();
