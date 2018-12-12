const spawnp = require('spawnp');
const log = console.log.bind(console); // eslint-disable-line
const chalk = require('chalk');
const {
  retry
} = require('./util');

/**
 * 1. run commands concurrently
 * 2. stat the results
 *
 * command = {
 *  name: '',
 *  command: [], // used to spawn
 *  options: {},
 *  retry: 0
 * }
 *
 * command result = {
 *   type: 'success' | 'fail',
 *   errMsg: String
 * }
 */
const runCommands = (commands, {
  onlys = [],
  sequence = false
} = {}) => {
  const _onlys = onlys.map((item) => item.trim()).filter((item) => item !== '');

  return runCommandsHelp(commands.filter((command) => {
    if (_onlys && _onlys.length) {
      return _onlys.find((only) => new RegExp(only).test(command.name));
    } else {
      return true;
    }
  }), sequence);
};

const runCommandsHelp = (commands, sequence) => {
  const t1 = new Date().getTime();

  const commandHandler = (command, index) => {
    return retry(spawnCmd, command.retry || 0)(command, pickColor(index)).then(() => {
      return {
        type: 'success'
      };
    }).catch((err) => {
      return {
        type: 'fail',
        errMsg: err.stderrs.join('') || err.message
      };
    });
  };

  const runSequence = () => {
    return commands.reduce((prev, command, index) => {
      return prev.then((rets) => {
        return commandHandler(command, index).then((ret) => {
          rets.push(ret);
          return rets;
        });
      });
    }, Promise.resolve([]));
  };

  const runConcurrent = () => {
    return Promise.all(commands.map(commandHandler));
  };

  return (sequence ? runSequence() : runConcurrent()).then((stats) => {
    const t2 = new Date().getTime();
    log('-------------------------------------------------');
    log(chalk.blue(`[stats of command results] total time: ${t2 - t1}ms`));
    stats.forEach(({
      type,
      errMsg
    }, index) => {
      const {
        name = '', command
      } = commands[index];
      const cwsymbol = type === 'success' ? chalk.green('✔') : chalk.red('✘');
      const title = chalk[pickColor(index)](`${cwsymbol} ${index}.[${name}]`);
      const cmdStr = `${command.join(' ')}`;
      const content = type === 'success' ? chalk.green(`${cmdStr}`) : chalk.red(`${cmdStr}, ${errMsg}`);
      log(`${title} ${content}`);
    });
  });
};

const emptyPrefix = '  ';
// eg: command = ['echo', '123', '456']
const spawnCmd = ({
  name = '',
  command,
  options
}, color) => {
  return spawnp(command[0], command.slice(1), options, {
    stderr: true,
    onChild: (child) => {
      // stdout
      child.stdout && child.stdout.on('data', (chunk) => {
        const prefix = `[${chalk[color](name)}] `;
        const text = `${prefix}${chunk.toString()}`;
        let lines = text.split('\n');
        if (lines[lines.length - 1] === '') {
          lines.pop();
        }
        process.stdout.write(lines[0] + '\n');
        lines.slice(1).forEach((line) => {
          process.stdout.write(`${emptyPrefix}${line}\n`);
        });
      });

      // std err
      child.stderr && child.stderr.on('data', (chunk) => {
        const prefix = `[${chalk[color](name)}] `;
        const text = chunk.toString();
        let lines = text.split('\n');
        if (lines[lines.length - 1] === '') {
          lines.pop();
        }
        process.stderr.write(`${prefix}${chalk.red(lines[0])}\n`);
        lines.slice(1).forEach((line) => {
          process.stderr.write(`${emptyPrefix}${chalk.red(line)}\n`);
        });
      });
    }
  });
};

const colors = ['blue', 'yellow', 'cyan', 'white', 'magenta', 'gray'];
const pickColor = (index) => {
  return colors[index % colors.length];
};

module.exports = {
  runCommands
};
