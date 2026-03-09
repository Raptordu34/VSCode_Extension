// section-utils.js — utilitaires injectés dans chaque section d'exercice

(function () {
    // ── BOUTON COPIER sur les blocs pre ──
    document.querySelectorAll('pre').forEach(pre => {
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

    // ── GESTION DES SOLUTIONS FLOUTÉES ──
    document.querySelectorAll('.solution.hidden').forEach(solution => {
        // Envelopper le contenu de la solution dans une div si ce n'est pas déjà fait
        // pour appliquer le flou uniquement sur le contenu, et pas sur le bouton
        let content = solution.querySelector('.solution-content');
        if (!content) {
            content = document.createElement('div');
            content.className = 'solution-content';
            while (solution.firstChild) {
                content.appendChild(solution.firstChild);
            }
            solution.appendChild(content);
        }

        // Ajouter le bouton de révélation
        const revealBtn = document.createElement('button');
        revealBtn.className = 'solution-reveal-btn';
        revealBtn.textContent = 'Voir la solution';
        solution.appendChild(revealBtn);

        revealBtn.addEventListener('click', () => {
            solution.classList.remove('hidden');
            revealBtn.remove(); // Enlever le bouton une fois révélé
        });
    });

    // ── GESTION DES INDICES PROGRESSIFS (HINT BOX) ──
    document.querySelectorAll('.hint-box').forEach(hintBox => {
        const header = hintBox.querySelector('.hint-header');
        if (header) {
            header.addEventListener('click', () => {
                hintBox.classList.toggle('open');
            });
        }
    });

})();
