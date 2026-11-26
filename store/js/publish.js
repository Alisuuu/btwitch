/* ==========================================================================
   ALIVE STORE — Módulo de Publicação de Temas da Comunidade
   ========================================================================== */
(function () {
  'use strict';

  var selectedFile = null;
  var I = window.ALIVE_I18N;
  function t(k, vars) { return I ? I.t(k, vars) : k; }

  function initPublish() {
    var btnPublish = document.getElementById('btnPublish');
    var modal = document.getElementById('publishModal');
    var btnClose = document.getElementById('publishClose');
    var dropzone = document.getElementById('publishDropzone');
    var fileInput = document.getElementById('publishFileInput');
    var submitBtn = document.getElementById('publishSubmitBtn');
    var previewCard = document.getElementById('publishPreviewCard');
    var themeNameEl = document.getElementById('publishThemeName');
    var themeDetailsEl = document.getElementById('publishThemeDetails');
    var statusBox = document.getElementById('publishStatus');

    if (!btnPublish || !modal) return;

    function openModal() {
      resetForm();
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      if (btnClose) btnClose.focus();
    }

    function closeModal() {
      modal.classList.remove('open');
      document.body.style.overflow = '';
      resetForm();
    }

    function resetForm() {
      selectedFile = null;
      if (fileInput) fileInput.value = '';
      if (previewCard) previewCard.style.display = 'none';
      if (statusBox) {
        statusBox.style.display = 'none';
        statusBox.className = 'publish-status-box';
        statusBox.textContent = '';
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = t('publish_btn');
      }
    }

    function showStatus(msg, type) {
      if (!statusBox) return;
      statusBox.style.display = 'block';
      statusBox.className = 'publish-status-box ' + (type || 'info');
      statusBox.textContent = msg;
    }

    async function handleFile(file) {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.zip')) {
        showStatus(t('publish_err_zip'), 'error');
        return;
      }

      showStatus(t('publish_validating'), 'info');

      try {
        if (!window.JSZip) {
          throw new Error(t('publish_err_jszip'));
        }

        var zip = await window.JSZip.loadAsync(file);
        var themeJsonFile = zip.file('theme.json');

        if (!themeJsonFile) {
          showStatus(t('publish_err_themejson'), 'error');
          if (previewCard) previewCard.style.display = 'none';
          if (submitBtn) submitBtn.disabled = true;
          return;
        }

        var jsonText = await themeJsonFile.async('text');
        var theme = JSON.parse(jsonText);

        if (!theme.name) {
          throw new Error(t('publish_err_name'));
        }

        selectedFile = file;
        if (themeNameEl) themeNameEl.textContent = theme.name;
        if (themeDetailsEl) {
          var widgetsCount = (theme.widgets || []).length;
          var hasStandby = theme.standby && theme.standby.enabled ? t('publish_with_standby') : t('publish_no_standby');
          themeDetailsEl.textContent = (theme.author || 'Alive Studio') + ' · ' + widgetsCount + ' widget(s) · ' + hasStandby;
        }

        if (previewCard) previewCard.style.display = 'flex';
        if (statusBox) statusBox.style.display = 'none';
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = t('publish_btn');
        }
      } catch (err) {
        showStatus(t('publish_err_read', { err: err.message }), 'error');
        if (previewCard) previewCard.style.display = 'none';
        if (submitBtn) submitBtn.disabled = true;
      }
    }

    // Abertura e fechamento
    btnPublish.addEventListener('click', openModal);
    if (btnClose) btnClose.addEventListener('click', closeModal);

    var backdrop = modal.querySelector('.modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeModal);

    // Seleção de arquivo
    if (dropzone && fileInput) {
      dropzone.addEventListener('click', function () {
        fileInput.click();
      });

      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) {
          handleFile(fileInput.files[0]);
        }
      });

      dropzone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      });

      dropzone.addEventListener('dragleave', function () {
        dropzone.classList.remove('drag-over');
      });

      dropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleFile(e.dataTransfer.files[0]);
        }
      });
    }

    // Submissão do tema para o storage
    if (submitBtn) {
      submitBtn.addEventListener('click', async function () {
        if (!selectedFile) return;

        submitBtn.disabled = true;
        submitBtn.textContent = t('publish_submitting');
        showStatus(t('publish_uploading'), 'info');

        try {
          var uploadUrl = '/api/upload?name=' + encodeURIComponent(selectedFile.name);
          var res = await fetch(uploadUrl, {
            method: 'POST',
            body: selectedFile
          });

          var data = await res.json().catch(function () {
            return { ok: false, error: t('publish_invalid_resp') };
          });

          if (!res.ok || !data.ok) {
            throw new Error(data.error || ('HTTP ' + res.status));
          }

          if (window.ALIVE_UI && window.ALIVE_UI.toast) {
            window.ALIVE_UI.toast(t('publish_success'), 'ok');
          }

          closeModal();

          // Alterna para a aba Comunidade e recarrega os temas
          var comTab = document.querySelector('.tab-btn[data-tab="comunidade"]');
          if (comTab) comTab.click();

          if (window.ALIVE_THEMES_API && window.ALIVE_THEMES_API.load) {
            window.ALIVE_THEMES_API.load();
          }
        } catch (err) {
          showStatus(t('publish_fail', { err: err.message }), 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = t('publish_retry');
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPublish);
  } else {
    initPublish();
  }
})();
