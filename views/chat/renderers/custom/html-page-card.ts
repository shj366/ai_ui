import type { PropType } from 'vue';

import { computed, defineComponent, h, onMounted, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import QRCode from 'qrcode';

interface HtmlPageCommand {
  action: 'show_html_page';
  description?: string;
  download_url?: string;
  filename?: string;
  message?: string;
  title?: string;
  url?: string;
}

function isAbsoluteUrl(url: string) {
  return /^https?:\/\//iu.test(url);
}

function resolveUrl(url?: string) {
  if (!url) {
    return '';
  }
  if (isAbsoluteUrl(url)) {
    return url;
  }
  return `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`;
}

function openUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function downloadUrl(url: string, filename?: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'ai-page.html';
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function useQrCodeDataUrl(text: () => string) {
  const dataUrl = ref('');

  async function refresh() {
    const value = text();
    dataUrl.value = value
      ? await QRCode.toDataURL(value, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 144,
        })
      : '';
  }

  onMounted(refresh);
  watch(text, refresh);
  return dataUrl;
}

export function isHtmlPageCommand(value: unknown): value is HtmlPageCommand {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { action?: unknown }).action === 'show_html_page'
  );
}

export const AIHtmlPageCard = defineComponent({
  name: 'AIHtmlPageCard',
  props: {
    data: {
      required: true,
      type: Object as PropType<HtmlPageCommand>,
    },
  },
  setup(props) {
    const previewUrl = computed(() => resolveUrl(props.data.url));
    const downloadLink = computed(() =>
      resolveUrl(props.data.download_url || props.data.url),
    );
    const qrcode = useQrCodeDataUrl(() => previewUrl.value);

    return () => {
      if (!previewUrl.value) {
        return null;
      }

      return h(
        'div',
        {
          class:
            'max-w-xl rounded-xl border border-border/70 bg-background/80 p-3 shadow-sm',
        },
        [
          h('div', { class: 'flex items-start gap-3' }, [
            h('img', {
              alt: '页面二维码',
              class:
                'size-32 shrink-0 rounded-lg border border-border bg-white p-1',
              src: qrcode.value,
            }),
            h('div', { class: 'min-w-0 flex-1 space-y-2' }, [
              h('div', { class: 'min-w-0' }, [
                h(
                  'div',
                  {
                    class:
                      'truncate text-sm font-semibold leading-6 text-foreground',
                  },
                  props.data.title || 'AI 生成页面',
                ),
                props.data.description || props.data.message
                  ? h(
                      'div',
                      {
                        class:
                          'line-clamp-2 text-xs leading-5 text-muted-foreground',
                      },
                      props.data.description || props.data.message,
                    )
                  : null,
              ]),
              h(
                'div',
                {
                  class:
                    'break-all rounded-lg bg-muted/40 px-2 py-1.5 text-[11px] leading-4 text-muted-foreground',
                },
                previewUrl.value,
              ),
              h('div', { class: 'flex flex-wrap gap-2' }, [
                h(
                  'button',
                  {
                    class:
                      'inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90',
                    type: 'button',
                    onClick: () => openUrl(previewUrl.value),
                  },
                  [
                    h(IconifyIcon, {
                      class: 'size-3.5',
                      icon: 'mdi:open-in-new',
                    }),
                    '打开',
                  ],
                ),
                h(
                  'button',
                  {
                    class:
                      'inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted',
                    type: 'button',
                    onClick: () =>
                      downloadUrl(downloadLink.value, props.data.filename),
                  },
                  [
                    h(IconifyIcon, {
                      class: 'size-3.5',
                      icon: 'mdi:download',
                    }),
                    '下载',
                  ],
                ),
              ]),
            ]),
          ]),
        ],
      );
    };
  },
});
