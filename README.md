# express-static-files-manager

// describe why / what

## Usage

### manageStaticFilesServing(config : Config)

The only function that needs to be called when your express starts.
This will clone your project, build it and then place it within your `/public` directory ( or the custom public directory if that is set) ready to be served by your express webserver.
If you set up the webhook, this will also automatically update your served files within the `/public` directory upon new commits.

`index.ts`

```js
import express from 'express';
import path from 'path';
import { manageStaticFilesServing } from 'express-static-files-manager';

const app = express();

app.use(express.static(path.join(__dirname, '../public')));

manageStaticFilesServing({
  repoUrl: 'https://github.com/Username/yourReponame',
  branch: 'production'
});
```

#### Config

| **field**         | **type**      | **defaultValue** | **mandatory** | **description**                                                                                   |
| ----------------- | ------------- | ---------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| repoUrl           | string        | undefined        | yes           | Your repository's URL                                                                             |
| onHookReceived    | function      | undefined        | no            | Overwrites default express-static-files-manager hook controller passing express res, req and next |
| onStartBuild      | function      | undefined        | no            | Function called on build start                                                                    |
| onError           | function      | undefined        | no            | Function called on error                                                                          |
| onFinish          | function      | undefined        | no            | Function called on build finish                                                                   |
| githubUsername    | string        | undefined        | no            | Your github username                                                                              |
| githubPassword    | string        | undefined        | no            | Your github password                                                                              |
| allowStdio        | boolean       | false            | no            | Setting this to true will pipe to stdio                                                           |
| skipNpmInstall    | boolean       | false            | no            | If you wish to skip npm install phase                                                             |
| skipBuildPhase    | boolean       | false            | no            | If you wish to skip build phase                                                                   |
| branch            | string        | "master"         | no            | Your branch name                                                                                  |
| customPublicDir   | string        | "public"         | no            | The directory containing your public static files                                                 |
| customWorkDir     | string        | \$currentDir     | no            | The directory where builds are generated and processed                                            |
| customBuildScript | string        | "build"          | no            | Set a custom script to use in your packages.json to build your files                              |
| webhookConfig     | WebhookConfig | undefined        | no            | The webhook config                                                                                |

#### WebhookConfig

| **field**   | **type** | **defaultValue** | **mandatory** | **description**                                      |
| ----------- | -------- | ---------------- | ------------- | ---------------------------------------------------- |
| expressApp  | object   | undefined        | yes           | Your express app (`const expressApp = express();`)   |
| callbackUrl | string   | undefined        | yes           | The route called by your github hook                 |
| secret      | string   | undefined        | no            | The secret passphrase associated to your github hook |

## Webhook usage

- Declare a webhook manually on your repository https://github.com/{yourOrganization}/{repostoryName}/settings/hooks/new
- Assign it a route and express-static-files-manager will automatically take care of that endpoint as long as you set `webhookConfig.callbackUrl` accordingly.
- Create a secret passphrase and set `webhookConfig.secret` accordingly.

`index.ts`

```js
import express from 'express';
import path from 'path';
import { manageStaticFilesServing } from 'express-static-files-manager';

const app = express();

app.use(express.static(path.join(__dirname, '../public')));

manageStaticFilesServing({
  repoUrl: 'https://github.com/yourUserName/yourRepositoryName',
  branch: 'master',
  webhookConfig: {
    callbackUrl: '/githubhook',
    secret: 'yoursupertopsecret',
    expressApp: app
  }
});
```
