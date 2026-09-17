/**
 * React-острів практичної 2 «Вибір форми бізнесу» (client:only): дві вкладки — конструктор рішення
 * (параметри стартапу → допустимі форми з нормою на кожен наслідок) і задача на динаміку ЄДРПОУ з XP.
 * Без window.location і base-URL: острів можна без змін зібрати в SCORM.
 */
import { useState } from 'react';
import { legalFormActivityId, type ChoiceDefinition, type RegistrySeriesDefinition } from '../../engines/legal-form';
import { DynamicsTask } from './legal-form/DynamicsTask';
import { FormConstructor, type StartupPreset } from './legal-form/FormConstructor';
import type { NormRef } from './norms';
import { ModeTabs, panelId, tabId, type TrainerMode } from './ui/ModeTabs';

const PREFIX = 'legal-form';
const TAB_LABELS: Partial<Record<TrainerMode, string>> = { calc: 'Конструктор', task: 'Задача' };

export interface LegalFormTrainerProps {
  readonly practicalId: string;
  readonly definition: ChoiceDefinition;
  readonly norms: Readonly<Record<string, NormRef>>;
  readonly presets: readonly StartupPreset[];
  readonly series: RegistrySeriesDefinition;
}

export function LegalFormTrainer({ practicalId, definition, norms, presets, series }: LegalFormTrainerProps) {
  const [mode, setMode] = useState<TrainerMode>('calc');
  const activityId = legalFormActivityId(practicalId);
  return (
    <div className="trainer" data-trainer-island="legal-form" data-mode={mode}>
      <ModeTabs prefix={PREFIX} mode={mode} onChange={setMode} label="Режим тренажера вибору форми" labels={TAB_LABELS} />
      <div role="tabpanel" id={panelId(PREFIX, 'calc')} aria-labelledby={tabId(PREFIX, 'calc')} hidden={mode !== 'calc'}>
        <FormConstructor prefix={PREFIX} definition={definition} norms={norms} presets={presets} />
      </div>
      <div role="tabpanel" id={panelId(PREFIX, 'task')} aria-labelledby={tabId(PREFIX, 'task')} hidden={mode !== 'task'}>
        <DynamicsTask prefix={PREFIX} activityId={activityId} series={series} />
      </div>
    </div>
  );
}
