/** Пакет «Кумулятивне голосування»: тренажер-калькулятор з режимами «Розрахунок» і «Задача». */
import { CumulativeTrainer } from '../../../../src/components/trainers/CumulativeTrainer';
import { bootScormPackage } from './boot';

bootScormPackage('cumulative', () => <CumulativeTrainer />);
