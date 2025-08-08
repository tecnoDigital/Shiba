import promClient from 'prom-client';

// Counter for IronPay requests
const ironPayRequestCounter = new promClient.Counter({
  name: 'ironpay_requests_total',
  help: 'Total number of IronPay requests'
});

// Counter for IronPay commands
const ironPayCommandCounter = new promClient.Counter({
  name: 'ironpay_commands_total',
  help: 'Total number of IronPay commands'
});

export function incrementRequest() {
  ironPayRequestCounter.inc();
}

export function incrementCommand(command) {
  ironPayCommandCounter.inc();
}
