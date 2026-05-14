// Расчёт токарной фаски
// Геометрия: фаска — гипотенуза прямоугольного треугольника.
// Катеты: Z (осевой, вдоль оси вращения) и X (радиальный, изменение радиуса).
// Угол α может отсчитываться либо от осевого катета ("2×45°" на чертеже),
// либо от радиального катета. Мы позволяем выбрать.

(function () {
    'use strict';

    const state = {
        location: 'outer',      // 'outer' | 'inner'
        angleFrom: 'axial',     // 'axial' (угол у торца, между Z-катетом и гипотенузой)
                                // 'radial' (угол между X-катетом и гипотенузой)
        known: 'axial',         // 'axial' | 'radial' | 'hyp'
        angle: 45,
        knownValue: 2,
        diameter: null,
    };

    // Парсинг чисел с поддержкой запятой как десятичного разделителя (русская локаль)
    const parseNum = (v) => {
        if (v === null || v === undefined) return NaN;
        const s = String(v).trim().replace(',', '.');
        if (s === '') return NaN;
        return parseFloat(s);
    };

    // ---------- DOM ----------
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const angleInput = $('#angle');
    const knownValueInput = $('#knownValue');
    const knownLabel = $('#knownLabel');
    const diameterInput = $('#diameter');
    const resultsEl = $('#results');
    const angleHint = $('#angleHint');

    // Сегментированные переключатели
    $$('.segmented').forEach((group) => {
        const name = group.dataset.group;
        group.addEventListener('click', (e) => {
            const btn = e.target.closest('.seg');
            if (!btn) return;
            group.querySelectorAll('.seg').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            state[name] = btn.dataset.value;
            onStateChange();
        });
    });

    // Быстрые кнопки углов
    $$('.qbtn').forEach((btn) => {
        btn.addEventListener('click', () => {
            angleInput.value = btn.dataset.angle;
            state.angle = parseFloat(btn.dataset.angle);
            onStateChange();
        });
    });

    angleInput.addEventListener('input', () => {
        state.angle = parseNum(angleInput.value);
        onStateChange();
    });
    knownValueInput.addEventListener('input', () => {
        state.knownValue = parseNum(knownValueInput.value);
        onStateChange();
    });
    diameterInput.addEventListener('input', () => {
        const v = parseNum(diameterInput.value);
        state.diameter = isNaN(v) ? null : v;
        onStateChange();
    });

    // ---------- Расчёты ----------
    function computeChamfer() {
        const { angle, knownValue, known, angleFrom } = state;
        if (isNaN(angle) || isNaN(knownValue) || knownValue <= 0) return null;
        if (angle <= 0 || angle >= 90) return null;

        const rad = (angle * Math.PI) / 180;
        let Z, X, hyp;

        // Связь между Z, X и углом в зависимости от того, от какого катета угол.
        // Общая формула: пусть β — угол между гипотенузой и осевым катетом (Z).
        // Тогда X = hyp·sin(β), Z = hyp·cos(β), X/Z = tan(β).
        // Если пользователь ввёл угол от осевого катета: β = angle.
        // Если от радиального: β = 90° − angle, т.е. tan(β) = 1/tan(angle).
        const beta = angleFrom === 'axial' ? rad : (Math.PI / 2 - rad);
        const tanBeta = Math.tan(beta);
        const sinBeta = Math.sin(beta);
        const cosBeta = Math.cos(beta);

        if (known === 'axial') {
            Z = knownValue;
            X = Z * tanBeta;
            hyp = Z / cosBeta;
        } else if (known === 'radial') {
            X = knownValue;
            Z = X / tanBeta;
            hyp = X / sinBeta;
        } else { // hyp
            hyp = knownValue;
            Z = hyp * cosBeta;
            X = hyp * sinBeta;
        }

        return { Z, X, hyp, deltaD: 2 * X };
    }

    function fmt(v, d = 3) {
        if (v === null || v === undefined || isNaN(v)) return '—';
        return Number(v.toFixed(d)).toString();
    }

    function renderResults(r) {
        resultsEl.innerHTML = '';
        if (!r) {
            resultsEl.innerHTML = '<div class="error-message">Проверьте введённые значения (угол должен быть 0…90°, размер > 0).</div>';
            return;
        }

        // Подсвечиваем те параметры, которые вычислены (т.е. не совпадают с «известным»).
        const items = [
            { label: 'Осевой размер (по Z)', value: fmt(r.Z) + ' мм', primary: state.known !== 'axial' },
            { label: 'Радиальный (по радиусу X)', value: fmt(r.X) + ' мм', primary: state.known !== 'radial' },
            { label: 'Изменение диаметра ΔD = 2X', value: fmt(r.deltaD) + ' мм', primary: false, full: false },
            { label: 'Длина фаски (гипотенуза)', value: fmt(r.hyp) + ' мм', primary: state.known !== 'hyp', full: false },
        ];

        items.forEach((it) => {
            const div = document.createElement('div');
            div.className = 'result-item' + (it.primary ? ' primary' : '') + (it.full ? ' full' : '');
            div.innerHTML = `<div class="result-label">${it.label}</div>
                             <div class="result-value${it.primary ? ' primary' : ''}">${it.value}</div>`;
            resultsEl.appendChild(div);
        });

        // Если задан исходный диаметр — покажем итоговый диаметр после фаски.
        if (state.diameter && state.diameter > 0) {
            const D1 = state.diameter;
            const D2 = state.location === 'outer' ? D1 - 2 * r.X : D1 + 2 * r.X;
            const dDiv = document.createElement('div');
            dDiv.className = 'result-item full';
            dDiv.innerHTML = `<div class="result-label">Итоговый диаметр после фаски</div>
                              <div class="result-value">D1 = ${fmt(D1)} → D2 = ${fmt(D2)} мм</div>`;
            resultsEl.appendChild(dDiv);
        }
    }

    // ---------- Рисование SVG ----------
    function updateIllustration(r) {
        const svg = $('#illustration');
        const NS = 'http://www.w3.org/2000/svg';
        svg.innerHTML = '';

        const W = 400, H = 260;
        const cx = 40;               // левый край детали
        const axisY = H - 40;        // ось вращения внизу (показываем верхнюю половинку)
        const bodyTop = 70;          // верх заготовки
        const bodyRight = W - 40;
        const bodyHeight = axisY - bodyTop;

        // Масштаб для фаски внутри иллюстрации
        const maxChamferPx = 90;
        let Z = r ? r.Z : 4;
        let X = r ? r.X : 4;
        const maxCat = Math.max(Z, X, 0.001);
        const scale = maxChamferPx / maxCat;
        const zPx = Math.min(Z * scale, maxChamferPx);
        const xPx = Math.min(X * scale, maxChamferPx);

        const isOuter = state.location === 'outer';

        // Контур детали (верхняя половина, ось внизу штрихпунктирная)
        // Для наружной фаски: срезаем правый-верхний угол.
        // Для внутренней фаски: деталь с отверстием; рисуем верхнюю стенку с отверстием по центру по Y.
        let partPath;
        let chamferLine;   // координаты (x1,y1,x2,y2) — красная линия фаски
        let dimZ;          // {x1,y1,x2,y2, labelX, labelY}
        let dimX;
        let angleMarker;   // {cx, cy, r, startA, endA, labelX, labelY}

        if (isOuter) {
            // Наружная: деталь — прямоугольник, правый-верхний угол срезан фаской
            // Фаска идёт из точки (bodyRight - zPx, bodyTop) в (bodyRight, bodyTop + xPx)
            const pA = { x: bodyRight - zPx, y: bodyTop };
            const pB = { x: bodyRight, y: bodyTop + xPx };
            partPath = `M ${cx} ${bodyTop} L ${pA.x} ${pA.y} L ${pB.x} ${pB.y} L ${bodyRight} ${axisY} L ${cx} ${axisY} Z`;
            chamferLine = { x1: pA.x, y1: pA.y, x2: pB.x, y2: pB.y };

            // Размер Z — по верху, от pA влево (но показываем длину от pA до правого края — т.е. zPx)
            dimZ = {
                x1: pA.x, y1: bodyTop - 22,
                x2: bodyRight, y2: bodyTop - 22,
                labelX: (pA.x + bodyRight) / 2, labelY: bodyTop - 27,
                text: 'Z = ' + (r ? fmt(r.Z) : '?')
            };
            // Размер X (радиальный) — справа, по вертикали от bodyTop до pB.y
            dimX = {
                x1: bodyRight + 22, y1: bodyTop,
                x2: bodyRight + 22, y2: pB.y,
                labelX: bodyRight + 28, labelY: (bodyTop + pB.y) / 2,
                text: 'X = ' + (r ? fmt(r.X) : '?')
            };

            // Угловая дуга
            // Если угол от осевого катета — рисуем в точке pA, между направлением вдоль Z (влево от pA) и гипотенузой (к pB)
            // Если угол от радиального катета — рисуем в точке pB, между направлением X (вверх от pB) и гипотенузой (к pA)
            const angleLabelOuter = isNaN(state.angle) ? '' : ('α = ' + fmt(state.angle, 1) + '°');
            if (state.angleFrom === 'axial') {
                angleMarker = arcBetween(pA, { x: pA.x - 30, y: pA.y }, pB, 24, angleLabelOuter);
            } else {
                angleMarker = arcBetween(pB, { x: pB.x, y: pB.y - 30 }, pA, 24, angleLabelOuter);
            }
        } else {
            // Внутренняя фаска (отверстие).
            // Показываем продольное сечение трубы/стенки с отверстием (верхнюю половину от оси Z).
            // Компоновка по вертикали сверху вниз:
            //   bodyTop .................. внешняя поверхность детали (наружный диаметр)
            //      ↓  материал (стенка трубы)
            //   wallBottom ............... кромка отверстия (внутренний диаметр)
            //      ↓  отверстие (воздух)
            //   axisY .................... ось вращения (штрихпунктир)
            //
            // Фаска срезает НИЖНИЙ-ПРАВЫЙ угол стенки (угол между правым торцом и поверхностью отверстия),
            // т.е. вход в отверстие становится конусным. X отсчитывается ВВЕРХ — в толщу материала
            // (радиус отверстия на торце увеличивается, ΔD положительный).
            const wallBottom = bodyTop + 90;  // кромка отверстия
            // Точки фаски
            const pA = { x: bodyRight - zPx, y: wallBottom };   // на нижней кромке стенки (внутр. поверхность отверстия)
            const pB = { x: bodyRight, y: wallBottom - xPx };   // на правом торце стенки, выше на xPx
            // Контур стенки: сверху — внешняя поверхность, справа — торец до pB, затем фаска pB→pA, затем внутренняя поверхность влево.
            partPath = `M ${cx} ${bodyTop} L ${bodyRight} ${bodyTop} L ${pB.x} ${pB.y} L ${pA.x} ${pA.y} L ${cx} ${wallBottom} Z`;
            chamferLine = { x1: pA.x, y1: pA.y, x2: pB.x, y2: pB.y };

            // Размер Z — снизу (под внутренней кромкой стенки), от pA до правого торца
            dimZ = {
                x1: pA.x, y1: wallBottom + 22,
                x2: bodyRight, y2: wallBottom + 22,
                labelX: (pA.x + bodyRight) / 2, labelY: wallBottom + 34,
                text: 'Z = ' + (r ? fmt(r.Z) : '?')
            };
            // Размер X — справа, по вертикали от pB.y до wallBottom (вверх)
            dimX = {
                x1: bodyRight + 22, y1: pB.y,
                x2: bodyRight + 22, y2: wallBottom,
                labelX: bodyRight + 28, labelY: (pB.y + wallBottom) / 2,
                text: 'X = ' + (r ? fmt(r.X) : '?')
            };

            // Угловая дуга:
            // — angleFrom === 'axial': угол в точке pA (на кромке отверстия),
            //     между направлением осевого катета (вправо, вдоль внутренней поверхности к торцу) и гипотенузой (к pB).
            // — angleFrom === 'radial': угол в точке pB (на торце),
            //     между направлением радиального катета (вниз, вдоль торца к pA-стороне) и гипотенузой (к pA).
            const angleLabelInner = isNaN(state.angle) ? '' : ('α = ' + fmt(state.angle, 1) + '°');
            if (state.angleFrom === 'axial') {
                angleMarker = arcBetween(pA, { x: pA.x + 30, y: pA.y }, pB, 24, angleLabelInner);
            } else {
                angleMarker = arcBetween(pB, { x: pB.x, y: pB.y + 30 }, pA, 24, angleLabelInner);
            }
        }

        // Деталь
        const part = document.createElementNS(NS, 'path');
        part.setAttribute('d', partPath);
        part.setAttribute('class', 'part-fill');
        svg.appendChild(part);

        // Ось вращения
        const axis = document.createElementNS(NS, 'line');
        axis.setAttribute('x1', 10);
        axis.setAttribute('y1', axisY);
        axis.setAttribute('x2', W - 10);
        axis.setAttribute('y2', axisY);
        axis.setAttribute('class', 'axis');
        svg.appendChild(axis);

        const axisLabel = document.createElementNS(NS, 'text');
        axisLabel.setAttribute('x', W - 14);
        axisLabel.setAttribute('y', axisY - 4);
        axisLabel.setAttribute('class', 'label-text');
        axisLabel.setAttribute('text-anchor', 'end');
        axisLabel.textContent = 'ось Z (ось вращения)';
        svg.appendChild(axisLabel);

        // Линия фаски (красная)
        const cl = document.createElementNS(NS, 'line');
        cl.setAttribute('x1', chamferLine.x1);
        cl.setAttribute('y1', chamferLine.y1);
        cl.setAttribute('x2', chamferLine.x2);
        cl.setAttribute('y2', chamferLine.y2);
        cl.setAttribute('class', 'chamfer-line');
        svg.appendChild(cl);

        // Размер Z
        drawDimension(svg, dimZ, 'horizontal');
        // Размер X
        drawDimension(svg, dimX, 'vertical');

        // Угол
        drawAngle(svg, angleMarker);

        // Подпись типа
        const typeLabel = document.createElementNS(NS, 'text');
        typeLabel.setAttribute('x', cx + 4);
        typeLabel.setAttribute('y', bodyTop - 10);
        typeLabel.setAttribute('class', 'label-text');
        typeLabel.textContent = isOuter ? 'Наружная фаска (вал)' : 'Внутренняя фаска (отверстие)';
        svg.appendChild(typeLabel);
    }

    function drawDimension(svg, d, orient) {
        const NS = 'http://www.w3.org/2000/svg';
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', d.x1);
        line.setAttribute('y1', d.y1);
        line.setAttribute('x2', d.x2);
        line.setAttribute('y2', d.y2);
        line.setAttribute('class', 'dim-line');
        svg.appendChild(line);

        // Стрелки-засечки
        const tickSize = 5;
        if (orient === 'horizontal') {
            [d.x1, d.x2].forEach((x) => {
                const t = document.createElementNS(NS, 'line');
                t.setAttribute('x1', x); t.setAttribute('y1', d.y1 - tickSize);
                t.setAttribute('x2', x); t.setAttribute('y2', d.y1 + tickSize);
                t.setAttribute('class', 'dim-line');
                svg.appendChild(t);
            });
        } else {
            [d.y1, d.y2].forEach((y) => {
                const t = document.createElementNS(NS, 'line');
                t.setAttribute('x1', d.x1 - tickSize); t.setAttribute('y1', y);
                t.setAttribute('x2', d.x1 + tickSize); t.setAttribute('y2', y);
                t.setAttribute('class', 'dim-line');
                svg.appendChild(t);
            });
        }

        const text = document.createElementNS(NS, 'text');
        text.setAttribute('x', d.labelX);
        text.setAttribute('y', d.labelY);
        text.setAttribute('class', 'dim-text');
        text.setAttribute('text-anchor', orient === 'horizontal' ? 'middle' : 'start');
        text.setAttribute('dominant-baseline', orient === 'horizontal' ? 'auto' : 'middle');
        text.textContent = d.text;
        svg.appendChild(text);
    }

    // arcBetween: дуга в вершине vertex, между направлениями к p1 и p2
    function arcBetween(vertex, p1, p2, radius, label) {
        const a1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
        const a2 = Math.atan2(p2.y - vertex.y, p2.x - vertex.x);
        return { vertex, a1, a2, radius, label };
    }

    function drawAngle(svg, m) {
        if (!m) return;
        const NS = 'http://www.w3.org/2000/svg';
        const { vertex, a1, a2, radius, label } = m;
        const x1 = vertex.x + radius * Math.cos(a1);
        const y1 = vertex.y + radius * Math.sin(a1);
        const x2 = vertex.x + radius * Math.cos(a2);
        const y2 = vertex.y + radius * Math.sin(a2);

        // Определим направление дуги (меньшую из двух)
        let delta = a2 - a1;
        while (delta <= -Math.PI) delta += 2 * Math.PI;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        const sweep = delta > 0 ? 1 : 0;
        const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;

        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${x2} ${y2}`);
        path.setAttribute('class', 'angle-arc');
        svg.appendChild(path);

        // Метка на биссектрисе (только если она задана)
        if (label) {
            const midA = a1 + delta / 2;
            const lx = vertex.x + (radius + 14) * Math.cos(midA);
            const ly = vertex.y + (radius + 14) * Math.sin(midA);
            const text = document.createElementNS(NS, 'text');
            text.setAttribute('x', lx);
            text.setAttribute('y', ly);
            text.setAttribute('class', 'angle-text');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.textContent = label;
            svg.appendChild(text);
        }
    }

    // ---------- Оркестрация ----------
    function updateKnownLabel() {
        const labels = {
            axial: 'Размер по Z (осевой), мм',
            radial: 'Размер по радиусу X, мм',
            hyp: 'Длина фаски (гипотенуза), мм',
        };
        knownLabel.textContent = labels[state.known];
    }

    function updateAngleHint() {
        if (state.angleFrom === 'axial') {
            angleHint.textContent = 'Угол между поверхностью фаски и торцом (перпендикуляром к оси). На чертежах обычно так: 2×45°.';
        } else {
            angleHint.textContent = 'Угол между поверхностью фаски и образующей (цилиндрической поверхностью / осью Z).';
        }
    }

    function onStateChange() {
        updateKnownLabel();
        updateAngleHint();
        const r = computeChamfer();
        renderResults(r);
        updateIllustration(r);
    }

    // Инициализация
    onStateChange();
})();
