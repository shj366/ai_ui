<script setup lang="ts">
import type { AIChatGenerationType } from '../../../api/chat';

import { computed, ref, watch } from 'vue';

type SettingsTabKey =
  | 'behavior'
  | 'generation'
  | 'image'
  | 'passthrough'
  | 'tools';

const props = withDefaults(
  defineProps<{
    generationType?: AIChatGenerationType;
  }>(),
  {
    generationType: 'text',
  },
);

const temperature = defineModel<number | undefined>('temperature');
const topP = defineModel<number | undefined>('topP');
const maxTokens = defineModel<number | undefined>('maxTokens');
const timeout = defineModel<number | undefined>('timeout');
const seed = defineModel<number | undefined>('seed');
const presencePenalty = defineModel<number | undefined>('presencePenalty');
const frequencyPenalty = defineModel<number | undefined>('frequencyPenalty');
const imageAction = defineModel<null | string | undefined>('imageAction');
const imageAspectRatio = defineModel<null | string | undefined>(
  'imageAspectRatio',
);
const imageBackground = defineModel<null | string | undefined>(
  'imageBackground',
);
const imageInputFidelity = defineModel<null | string | undefined>(
  'imageInputFidelity',
);
const imageModel = defineModel<string>('imageModel', { required: true });
const imageModeration = defineModel<null | string | undefined>(
  'imageModeration',
);
const imageOutputCompression = defineModel<number | undefined>(
  'imageOutputCompression',
);
const imageOutputFormat = defineModel<null | string | undefined>(
  'imageOutputFormat',
);
const imagePartialImages = defineModel<number | undefined>(
  'imagePartialImages',
);
const imageQuality = defineModel<null | string | undefined>('imageQuality');
const imageSize = defineModel<null | string | undefined>('imageSize');
const enableBuiltinTools = defineModel<boolean>('enableBuiltinTools', {
  required: true,
});
const parallelToolCalls = defineModel<boolean>('parallelToolCalls', {
  required: true,
});
const stopSequences = defineModel<string>('stopSequences', { required: true });
const extraHeaders = defineModel<string>('extraHeaders', { required: true });
const extraBody = defineModel<string>('extraBody', { required: true });
const logitBias = defineModel<string>('logitBias', { required: true });

const activeSettingsTabKey = ref<SettingsTabKey>('generation');
const isImageGeneration = computed(() => props.generationType === 'image');
const settingsTabBarStyle = computed(() =>
  isImageGeneration.value ? { display: 'none' } : undefined,
);

watch(
  isImageGeneration,
  (enabled) => {
    if (enabled) {
      activeSettingsTabKey.value = 'image';
      return;
    }

    if (activeSettingsTabKey.value === 'image') {
      activeSettingsTabKey.value = 'generation';
    }
  },
  { immediate: true },
);

const stopSequencesPlaceholder = '["</thinking>"]';
const extraHeadersPlaceholder = '{"x-trace-id":"chat-demo"}';
const extraBodyPlaceholder = '{"metadata":{"scene":"chat"}}';
const logitBiasPlaceholder = '{"198":-100}';

interface NumberFieldConfig {
  key: string;
  label: string;
  model: ReturnType<typeof defineModel<number | undefined>>;
  tip: string;
  max?: number;
  min?: number;
  placeholder?: string;
  step?: number;
  wide?: boolean;
}

interface SelectFieldConfig {
  key: string;
  label: string;
  model: ReturnType<typeof defineModel<null | string | undefined>>;
  options: Array<{ label: string; value: string }>;
  tip: string;
  placeholder?: string;
}

interface SwitchFieldConfig {
  key: string;
  label: string;
  model: ReturnType<typeof defineModel<boolean>>;
  tip: string;
}

interface TextareaFieldConfig {
  key: string;
  label: string;
  model: ReturnType<typeof defineModel<string>>;
  tip: string;
  placeholder: string;
  minRows: number;
  maxRows: number;
}

const generationFields: NumberFieldConfig[] = [
  {
    key: 'temperature',
    label: 'Temperature',
    model: temperature,
    tip: '控制回答的发散程度，越低越稳定，越高越灵活，取值范围 0 到 2',
    min: 0,
    max: 2,
    placeholder: '默认 1',
    step: 0.1,
  },
  {
    key: 'top-p',
    label: 'Top P',
    model: topP,
    tip: '控制候选词范围，通常与 Temperature 二选一微调即可，取值范围 0 到 1',
    min: 0,
    max: 1,
    placeholder: '模型默认',
    step: 0.1,
  },
  {
    key: 'max-tokens',
    label: 'Max Tokens',
    model: maxTokens,
    tip: '限制单次回答长度，可选；不填时由模型自行决定',
    min: 1,
    placeholder: '不限制',
  },
  {
    key: 'timeout',
    label: 'Timeout',
    model: timeout,
    tip: '超过这个时间还没返回结果时，请求会被视为超时，单位为秒',
    min: 0,
    placeholder: '不超时',
    step: 1,
  },
];

const behaviorFields: NumberFieldConfig[] = [
  {
    key: 'seed',
    label: 'Seed',
    model: seed,
    tip: '固定随机种子后，更容易复现相似结果；该项可选',
    placeholder: '随机',
  },
  {
    key: 'presence-penalty',
    label: 'Presence Penalty',
    model: presencePenalty,
    tip: '提高后更鼓励模型引入新内容，减少重复话题，取值范围 -2 到 2',
    min: -2,
    max: 2,
    placeholder: '模型默认',
    step: 0.1,
  },
  {
    key: 'frequency-penalty',
    label: 'Frequency Penalty',
    model: frequencyPenalty,
    tip: '提高后更少重复相同措辞，适合压制啰嗦输出，取值范围 -2 到 2',
    min: -2,
    max: 2,
    placeholder: '模型默认',
    step: 0.1,
    wide: true,
  },
];

const imageSelectFields: SelectFieldConfig[] = [
  {
    key: 'image-action',
    label: 'Image Action',
    model: imageAction,
    options: [
      { label: 'auto', value: 'auto' },
      { label: 'generate', value: 'generate' },
      { label: 'edit', value: 'edit' },
    ],
    placeholder: '后端默认',
    tip: '图片任务类型：自动判断、生成新图或编辑输入图片',
  },
  {
    key: 'image-size',
    label: 'Image Size',
    model: imageSize,
    options: [
      { label: 'auto', value: 'auto' },
      { label: '1024x1024', value: '1024x1024' },
      { label: '1024x1536', value: '1024x1536' },
      { label: '1536x1024', value: '1536x1024' },
      { label: '512', value: '512' },
      { label: '1K', value: '1K' },
      { label: '2K', value: '2K' },
      { label: '4K', value: '4K' },
    ],
    placeholder: '后端默认',
    tip: '图片尺寸，部分模型只支持其中一部分取值',
  },
  {
    key: 'image-aspect-ratio',
    label: 'Aspect Ratio',
    model: imageAspectRatio,
    options: [
      { label: '1:1', value: '1:1' },
      { label: '2:3', value: '2:3' },
      { label: '3:2', value: '3:2' },
      { label: '3:4', value: '3:4' },
      { label: '4:3', value: '4:3' },
      { label: '4:5', value: '4:5' },
      { label: '5:4', value: '5:4' },
      { label: '9:16', value: '9:16' },
      { label: '16:9', value: '16:9' },
      { label: '21:9', value: '21:9' },
    ],
    placeholder: '后端默认',
    tip: '图片宽高比，适合支持比例参数的图像模型',
  },
  {
    key: 'image-quality',
    label: 'Image Quality',
    model: imageQuality,
    options: [
      { label: 'auto', value: 'auto' },
      { label: 'low', value: 'low' },
      { label: 'medium', value: 'medium' },
      { label: 'high', value: 'high' },
    ],
    placeholder: '后端默认',
    tip: '图片输出质量',
  },
  {
    key: 'image-output-format',
    label: 'Output Format',
    model: imageOutputFormat,
    options: [
      { label: 'png', value: 'png' },
      { label: 'webp', value: 'webp' },
      { label: 'jpeg', value: 'jpeg' },
    ],
    placeholder: '后端默认',
    tip: '图片输出格式',
  },
  {
    key: 'image-background',
    label: 'Background',
    model: imageBackground,
    options: [
      { label: 'auto', value: 'auto' },
      { label: 'transparent', value: 'transparent' },
      { label: 'opaque', value: 'opaque' },
    ],
    placeholder: '后端默认',
    tip: '图片背景类型',
  },
  {
    key: 'image-input-fidelity',
    label: 'Input Fidelity',
    model: imageInputFidelity,
    options: [
      { label: 'low', value: 'low' },
      { label: 'high', value: 'high' },
    ],
    placeholder: '后端默认',
    tip: '图片编辑时对输入图片的保真度',
  },
  {
    key: 'image-moderation',
    label: 'Moderation',
    model: imageModeration,
    options: [
      { label: 'auto', value: 'auto' },
      { label: 'low', value: 'low' },
    ],
    placeholder: '后端默认',
    tip: '图片生成审核强度',
  },
];

const imageNumberFields: NumberFieldConfig[] = [
  {
    key: 'image-output-compression',
    label: 'Output Compression',
    model: imageOutputCompression,
    tip: '图片输出压缩质量，取值范围 0 到 100',
    min: 0,
    max: 100,
    placeholder: '后端默认',
    step: 1,
  },
  {
    key: 'image-partial-images',
    label: 'Partial Images',
    model: imagePartialImages,
    tip: '流式图片中间结果数量，取值范围 0 到 3',
    min: 0,
    max: 3,
    placeholder: '后端默认',
    step: 1,
  },
];

function updateSelectField(field: SelectFieldConfig, value: unknown) {
  field.model.value =
    value === null || value === undefined ? undefined : String(value);
}

const toolFields: SwitchFieldConfig[] = [
  {
    key: 'enable-builtin-tools',
    label: '启用内置工具',
    model: enableBuiltinTools,
    tip: '允许模型调用系统内置工具',
  },
  {
    key: 'parallel-tool-calls',
    label: '并行工具调用',
    model: parallelToolCalls,
    tip: '允许模型同时发起多个工具调用',
  },
];

const passthroughFields: TextareaFieldConfig[] = [
  {
    key: 'stop-sequences',
    label: '停止序列',
    model: stopSequences,
    tip: '当生成到这些内容时立即停止，适合截断特定格式，这里填写的是 JSON 数组',
    placeholder: stopSequencesPlaceholder,
    minRows: 2,
    maxRows: 4,
  },
  {
    key: 'extra-headers',
    label: 'Extra Headers',
    model: extraHeaders,
    tip: '额外附加到模型请求中的请求头，通常用于特殊网关，这里填写的是 JSON 对象',
    placeholder: extraHeadersPlaceholder,
    minRows: 2,
    maxRows: 4,
  },
  {
    key: 'extra-body',
    label: 'Extra Body',
    model: extraBody,
    tip: '透传额外请求体字段，适合补充模型专属参数，这里填写的是 JSON 内容',
    placeholder: extraBodyPlaceholder,
    minRows: 2,
    maxRows: 5,
  },
  {
    key: 'logit-bias',
    label: 'Logit Bias',
    model: logitBias,
    tip: '用来提高或压低特定 token 的出现概率，适合高级控制，这里填写的是 JSON 对象',
    placeholder: logitBiasPlaceholder,
    minRows: 2,
    maxRows: 4,
  },
];
</script>

<template>
  <a-tabs
    v-model:active-key="activeSettingsTabKey"
    :tab-bar-style="settingsTabBarStyle"
    size="large"
  >
    <a-tab-pane v-if="!isImageGeneration" key="generation" tab="生成控制">
      <a-flex vertical gap="middle">
        <a-alert
          show-icon
          title="控制输出的稳定性、候选范围和回答长度"
          type="info"
        />
        <a-card size="small" title="采样与长度">
          <a-form layout="vertical">
            <a-row :gutter="[16, 16]">
              <a-col
                v-for="field in generationFields"
                :key="field.key"
                :md="12"
                :span="24"
              >
                <a-form-item :label="field.label" :tooltip="field.tip">
                  <a-input-number
                    :value="field.model.value"
                    :max="field.max"
                    :min="field.min"
                    :placeholder="field.placeholder"
                    :step="field.step"
                    :style="{ width: '100%' }"
                    @update:value="field.model.value = $event"
                  />
                </a-form-item>
              </a-col>
            </a-row>
          </a-form>
        </a-card>
      </a-flex>
    </a-tab-pane>

    <a-tab-pane v-if="!isImageGeneration" key="behavior" tab="行为控制">
      <a-flex vertical gap="middle">
        <a-alert show-icon title="调整回复的复现性与重复倾向" type="info" />
        <a-card size="small" title="复现与惩罚参数">
          <a-form layout="vertical">
            <a-row :gutter="[16, 16]">
              <a-col
                v-for="field in behaviorFields"
                :key="field.key"
                :md="field.wide ? 24 : 12"
                :span="24"
              >
                <a-form-item :label="field.label" :tooltip="field.tip">
                  <a-input-number
                    :value="field.model.value"
                    :max="field.max"
                    :min="field.min"
                    :placeholder="field.placeholder"
                    :step="field.step"
                    :style="{ width: '100%' }"
                    @update:value="field.model.value = $event"
                  />
                </a-form-item>
              </a-col>
            </a-row>
          </a-form>
        </a-card>
      </a-flex>
    </a-tab-pane>

    <a-tab-pane key="image" tab="图片生成">
      <a-flex vertical gap="middle">
        <a-alert
          show-icon
          title="仅在生成类型为图片时生效，未填写的参数由后端或模型决定"
          type="info"
        />
        <a-card size="small" title="图像模型与输出">
          <a-form layout="vertical">
            <a-form-item
              label="Image Model"
              tooltip="图片生成底层模型；不填时由后端选择当前供应商的默认图片模型"
            >
              <a-input
                :value="imageModel"
                placeholder="例如 gpt-image-1"
                @update:value="imageModel = String($event ?? '')"
              />
            </a-form-item>
            <a-row :gutter="[16, 16]">
              <a-col
                v-for="field in imageSelectFields"
                :key="field.key"
                :md="12"
                :span="24"
              >
                <a-form-item :label="field.label" :tooltip="field.tip">
                  <a-select
                    :value="field.model.value"
                    :allow-clear="true"
                    :options="field.options"
                    :placeholder="field.placeholder"
                    @update:value="updateSelectField(field, $event)"
                  />
                </a-form-item>
              </a-col>
              <a-col
                v-for="field in imageNumberFields"
                :key="field.key"
                :md="12"
                :span="24"
              >
                <a-form-item :label="field.label" :tooltip="field.tip">
                  <a-input-number
                    :value="field.model.value"
                    :max="field.max"
                    :min="field.min"
                    :placeholder="field.placeholder"
                    :step="field.step"
                    :style="{ width: '100%' }"
                    @update:value="field.model.value = $event"
                  />
                </a-form-item>
              </a-col>
            </a-row>
          </a-form>
        </a-card>
      </a-flex>
    </a-tab-pane>

    <a-tab-pane v-if="!isImageGeneration" key="tools" tab="工具能力">
      <a-flex vertical gap="middle">
        <a-alert show-icon title="控制模型是否可以调用工具" type="warning" />
        <a-card size="small" title="工具调用">
          <a-form layout="vertical">
            <a-form-item
              v-for="field in toolFields"
              :key="field.key"
              :label="field.label"
              :tooltip="field.tip"
            >
              <a-switch
                :checked="field.model.value"
                @update:checked="field.model.value = Boolean($event)"
              />
            </a-form-item>
          </a-form>
        </a-card>
      </a-flex>
    </a-tab-pane>

    <a-tab-pane v-if="!isImageGeneration" key="passthrough" tab="请求透传">
      <a-flex vertical gap="middle">
        <a-alert show-icon title="高级请求参数" type="warning" />
        <a-card size="small" title="JSON 透传">
          <a-form layout="vertical">
            <a-form-item
              v-for="field in passthroughFields"
              :key="field.key"
              :label="field.label"
              :tooltip="field.tip"
            >
              <a-textarea
                :value="String(field.model.value ?? '')"
                :auto-size="{ minRows: field.minRows, maxRows: field.maxRows }"
                :placeholder="field.placeholder"
                @update:value="field.model.value = String($event ?? '')"
              />
            </a-form-item>
          </a-form>
        </a-card>
      </a-flex>
    </a-tab-pane>
  </a-tabs>
</template>
