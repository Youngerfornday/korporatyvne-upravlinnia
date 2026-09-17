/** Пакет «Дивіденди й чисті активи»: тренажер-калькулятор з режимами «Розрахунок» і «Задача». */
import { DividendTrainer } from '../../../../src/components/trainers/DividendTrainer';
import { bootScormPackage } from './boot';

bootScormPackage('dividends', () => <DividendTrainer />);
