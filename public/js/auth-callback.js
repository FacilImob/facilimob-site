import { toast } from './api.js';

const status = document.querySelector('#status');

toast(status, 'Este link nao e mais usado. Volte ao login e digite o codigo recebido por e-mail.', 'error');
