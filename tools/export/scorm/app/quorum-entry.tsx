/** Пакет «Кворум і голосування»: тренажер-калькулятор з режимами «Розрахунок» і «Задача». */
import { QuorumTrainer } from '../../../../src/components/trainers/QuorumTrainer';
import { bootScormPackage } from './boot';

bootScormPackage('quorum', () => <QuorumTrainer />);
