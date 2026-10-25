import type { GameEvent } from '@zero-day/engine';

export interface CoachStep {
  id: string;
  /** CSS selector of the element to spotlight; null centers the card. */
  selector: string | null;
  title: string;
  body: string;
  /** Engine events that move the tour forward on their own. */
  advanceOn?: GameEvent['type'][];
}

// Level 1 onboarding: one pass over every surface a player touches, in play order.
export const LEVEL1_STEPS: CoachStep[] = [
  {
    id: 'intro',
    selector: null,
    title: 'Ты на задании',
    body: 'Ты пентестер. Задача: пройти по сети до цели, взять её и закрыть дыры. Покажу, где что.',
  },
  {
    id: 'alarm',
    selector: '.hud-bar',
    title: 'Шкала тревоги',
    body: 'Каждый шумный шаг поднимает тревогу. Дойдёт до верха — тебя вычислят и откатят. Работай тихо.',
  },
  {
    id: 'map',
    selector: '.mission__map',
    title: 'Карта сети',
    body: 'Узлы сети. Кликни любой узел — слева откроются действия с ним. Выбери узел и жми «Далее».',
  },
  {
    id: 'scan',
    selector: '.inspector',
    title: 'Разведка узла',
    body: 'Действия выбранного узла. Сначала «Сканирование» — оно вскрывает порт и показывает слабости.',
    advanceOn: ['NodeScanned', 'ScanOpened'],
  },
  {
    id: 'attack',
    selector: '.inspector',
    title: 'Два пути атаки',
    body: 'Нашёл слабость — жми кнопку атаки (Брутфорс, Вирус…). То же можно набрать в терминале внизу: scan узел, затем bruteforce узел.',
    advanceOn: ['PuzzleOpened'],
  },
  {
    id: 'taken',
    selector: '.mission__map',
    title: 'Узел взят',
    body: 'Решишь мини-игру — узел наш, откроются соседи. Промах не карает, но шумит. Иди по карте к цели.',
    advanceOn: ['ExploitSucceeded'],
  },
  {
    id: 'terminal',
    selector: '.mission__terminal',
    title: 'Терминал',
    body: 'Быстрый путь без мыши. Набери help — покажет все команды. Любую атаку можно ввести здесь вручную.',
  },
  {
    id: 'board',
    selector: '.board',
    title: 'Доска улик',
    body: 'Зацепки падают сюда. Выбери две улики или ключа и жми «Соединить» — так куются ключи к замкам.',
    advanceOn: ['CluesFound', 'KeyAssembled'],
  },
  {
    id: 'objectives',
    selector: '.objective-tracker',
    title: 'Список целей',
    body: 'Цели кейса. Закрывай по порядку — они ведут к финалу и отчёту заказчику.',
  },
  {
    id: 'flipper',
    selector: '.flipper',
    title: 'Флиппер',
    body: 'Напарник. Подсказывает по ходу дела и чует тревогу. Дальше справишься сам. Удачи.',
  },
];
