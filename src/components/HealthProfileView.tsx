import React, { useState, useEffect } from 'react';
import { HealthProfile } from '../types';
import { Save, User, AlertCircle, Target, Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from './ui/input';
import { Button } from './ui/button';

interface Props {
  profile: HealthProfile;
  onSave: (profile: HealthProfile) => void;
}

export default function HealthProfileView({ profile, onSave }: Props) {
  const { t } = useTranslation();
  const [localProfile, setLocalProfile] = useState<HealthProfile>(profile);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalProfile(profile);
  }, [profile]);

  const handleSave = () => {
    onSave(localProfile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateArrayField = (field: keyof HealthProfile, value: string) => {
    const array = value.split(',').map(item => item.trim()).filter(Boolean);
    setLocalProfile({ ...localProfile, [field]: array });
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-full text-emerald-600 dark:text-emerald-400">
          <User className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('profile_title')}</h2>
          <p className="text-gray-600 dark:text-gray-400">{t('profile_subtitle')}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Heart className="w-4 h-4" />
              {t('profile_diet_type')}
            </label>
            <Input
              type="text"
              value={localProfile.dietTypes ? localProfile.dietTypes.join(', ') : ''}
              onChange={(e) => updateArrayField('dietTypes', e.target.value)}
              placeholder={t('profile_diet_placeholder')}
              autoCorrect="on"
              spellCheck="true"
              className="w-full bg-white dark:bg-gray-700 border-slate-300 dark:border-gray-600 rounded-full focus-visible:ring-emerald-500"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <AlertCircle className="w-4 h-4" />
              {t('profile_allergies')}
            </label>
            <Input
              type="text"
              value={localProfile.allergies.join(', ')}
              onChange={(e) => updateArrayField('allergies', e.target.value)}
              placeholder={t('profile_allergies_placeholder')}
              autoCorrect="on"
              spellCheck="true"
              className="w-full bg-white dark:bg-gray-700 border-slate-300 dark:border-gray-600 rounded-full focus-visible:ring-emerald-500"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Target className="w-4 h-4" />
              {t('profile_goals')}
            </label>
            <Input
              type="text"
              value={localProfile.goals.join(', ')}
              onChange={(e) => updateArrayField('goals', e.target.value)}
              placeholder={t('profile_goals_placeholder')}
              autoCorrect="on"
              spellCheck="true"
              className="w-full bg-white dark:bg-gray-700 border-slate-300 dark:border-gray-600 rounded-full focus-visible:ring-emerald-500"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <User className="w-4 h-4" />
              {t('profile_disliked')}
            </label>
            <Input
              type="text"
              value={localProfile.dislikedIngredients.join(', ')}
              onChange={(e) => updateArrayField('dislikedIngredients', e.target.value)}
              placeholder={t('profile_disliked_placeholder')}
              autoCorrect="on"
              spellCheck="true"
              className="w-full bg-white dark:bg-gray-700 border-slate-300 dark:border-gray-600 rounded-full focus-visible:ring-emerald-500"
            />
          </div>
        </div>

        <Button
          onClick={handleSave}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] text-white h-12 rounded-xl font-medium transition-all shadow-lg shadow-emerald-500/20"
        >
          <Save className="w-5 h-5" />
          {saved ? t('profile_saved') : t('profile_save_btn')}
        </Button>
      </div>
    </div>
  );
}
