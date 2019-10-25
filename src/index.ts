import crypto from 'crypto';
import execa from 'execa';
import { NextFunction, Request, Response } from 'express';
import fs from 'fs-extra';
import path from 'path';

interface Config {
  skipNpmInstall?: boolean;
  skipBuildPhase?: boolean;
  githubUsername?: string;
  githubPassword?: string;
  repoUrl: string;
  customBuildScript?: string;
  onStartBuild?: () => void;
  onHookReceived?: (
    req: Request,
    res: Response,
    next: NextFunction,
    config: Config
  ) => void;
  onError?: (err: any) => void;
  allowStdio?: boolean;
  branch?: string;
  onFinish?: () => void;
  customPublicDir?: string;
  customWorkDir?: string;
  webhookConfig?: {
    expressApp: any;
    callbackUrl: string;
    secret?: string;
  };
}

let isBuilding = false;
let pendingBuild = false;

async function fetchPublicFiles(config: Config) {
  if (config.onStartBuild) {
    config.onStartBuild();
  }

  const finalDestinationPath = config.customPublicDir
    ? config.customPublicDir
    : path.resolve(process.cwd(), 'public');

  let currentPublicBackup;
  try {
    if (getIsBuilding()) {
      setPendingBuild(true);
      return;
    }
    setIsBuilding(true);
    let stdio;
    if (config.allowStdio) {
      stdio = 'inherit';
    }

    let repoUrlcheck = config.repoUrl;

    if (repoUrlcheck.indexOf('.git') === -1) {
      repoUrlcheck = `${config.repoUrl}.git`;
    }

    const repoName = repoUrlcheck.substring(
      repoUrlcheck.lastIndexOf('/') + 1,
      repoUrlcheck.lastIndexOf('.git')
    );

    const needBackup = await fs.pathExists(finalDestinationPath);
    if (needBackup) {
      console.log('--Creating public backup--');
      currentPublicBackup = config.customWorkDir
        ? path.join(config.customWorkDir, 'publicBackup')
        : path.resolve(process.cwd(), 'publicBackup');

      await fs.copy(finalDestinationPath, currentPublicBackup);
    }

    const targetDirectory = config.customWorkDir
      ? path.join(config.customWorkDir, repoName)
      : path.resolve(process.cwd(), repoName);

    const execaOpts = { stdio, cwd: targetDirectory };

    const targetDirectoryAlreadyExist = await fs.pathExists(targetDirectory);
    if (targetDirectoryAlreadyExist) {
      await fs.remove(targetDirectory);
    }

    await fs.mkdirp(targetDirectory);

    const repoUrl = config.repoUrl.substring(
      config.repoUrl.indexOf('github.com/')
    );

    // tslint:disable-next-line:no-console
    console.log('--Cloning repo--');

    let branch = 'master';
    if (config.branch) {
      branch = config.branch;
    }

    if (config.githubUsername && config.githubPassword) {
      // @ts-ignore
      await execa(
        'git',
        [
          'clone',
          `https://${config.githubUsername}:${config.githubPassword}@${repoUrl}`
        ],
        { stdio, cwd: config.customWorkDir ? config.customWorkDir : undefined }
      );
    } else {
      await execa('git', ['clone', config.repoUrl], {
        stdio,
        cwd: config.customWorkDir ? config.customWorkDir : undefined
      });
    }

    await execa('git', ['checkout', branch], {
      stdio,
      cwd: config.customWorkDir ? config.customWorkDir : undefined
    });

    if (!config.skipNpmInstall) {
      console.log('--Installing dependencies--');
      await execa.command(`npm install --cwd ${targetDirectory}`, execaOpts);
    }

    if (!config.skipBuildPhase) {
      console.log('--Building react project--');

      let buildScript = 'build';
      if (config.customBuildScript) {
        buildScript = config.customBuildScript;
      }
      await execa.command(
        `npm run ${buildScript} --cwd ${targetDirectory}`,
        execaOpts
      );
    }

    await fs.remove(finalDestinationPath);
    await fs.copy(`${targetDirectory}/build`, finalDestinationPath);

    await fs.remove(targetDirectory);
    if (currentPublicBackup) {
      await fs.remove(currentPublicBackup);
    }

    if (config.onFinish) {
      config.onFinish();
    }

    // tslint:disable-next-line:no-console
    console.log('--Public directory created--');
    setIsBuilding(false);
    if (getPendingBuild()) {
      setPendingBuild(false);
      fetchPublicFiles(config);
    }
  } catch (e) {
    setIsBuilding(false);
    if (getPendingBuild()) {
      setPendingBuild(false);
      fetchPublicFiles(config);
    }
    if (config.onError) {
      config.onError(e);
    } else {
      // tslint:disable-next-line:no-console
      console.log(e);
    }

    if (currentPublicBackup) {
      // tslint:disable-next-line:no-console
      console.log('--Restoring backup--');
      await fs.copy(currentPublicBackup, finalDestinationPath);
      await fs.remove(currentPublicBackup);
    }
  }
}

export function manageStaticFilesServing(config: Config) {
  fetchPublicFiles(config);
  if (config.webhookConfig) {
    createWebhook(config);
  }
}

async function createWebhook(config: Config) {
  try {
    config.webhookConfig.expressApp.post(
      config.webhookConfig.callbackUrl,
      (req: Request, res: Response, next: NextFunction) =>
        handleHookCallback(req, res, next, config)
    );
  } catch (e) {
    console.log(e);
  }
}

function handleHookCallback(
  req: Request,
  res: Response,
  next: NextFunction,
  config: Config
) {
  if (config.onHookReceived) {
    config.onHookReceived(req, res, next, config);
  } else {
    if (
      (config.branch && req.body.ref.includes(config.branch)) ||
      (req.body.ref.includes('master') && !config.branch)
    ) {
      if (config.webhookConfig.secret) {
        const payload = JSON.stringify(req.body);
        const sigHeaderName = 'X-Hub-Signature';
        const hmac = crypto.createHmac('sha1', config.webhookConfig.secret);
        const digest = 'sha1=' + hmac.update(payload).digest('hex');
        const checksum = req.get(sigHeaderName);
        if (!checksum || !digest || checksum !== digest) {
          res.status(400).json({ error: 'Invalid Secret' });
        } else {
          res.status(202).json({});
          fetchPublicFiles(config);
        }
      } else {
        res.status(202).json({});
        fetchPublicFiles(config);
      }
    } else {
      res.status(202).json({});
    }
  }
}

function setIsBuilding(newisBuilding: boolean) {
  isBuilding = newisBuilding;
}

function getIsBuilding() {
  return isBuilding;
}

function setPendingBuild(newisBuilding: boolean) {
  console.log('--New build pending--');
  pendingBuild = newisBuilding;
}

function getPendingBuild() {
  return pendingBuild;
}
