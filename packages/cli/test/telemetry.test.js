'use strict';

require('./setup');

import fs from 'fs-extra';
import sinon from 'sinon';
import inquirer from 'inquirer';
import path from 'path';
import 'firebase/auth';
import 'firebase/firestore';

import Telemetry from '../src/telemetry';
import ProjectFile from '../src/models/files/ProjectFile';

import * as prompt from '../src/prompts/prompt';

describe('telemetry', function() {
  before(function() {
    this.originalDisableInteractivity = prompt.DISABLE_INTERACTIVITY;
    prompt.DISABLE_INTERACTIVITY = false;
  });

  after(function() {
    prompt.DISABLE_INTERACTIVITY = this.originalDisableInteractivity;
  });

  beforeEach('stub fs-extra functions', function() {
    this.readJsonStub = sinon.stub(fs, 'readJson').returns({ catch: () => undefined });
    this.ensureDirStub = sinon.stub(fs, 'ensureDir');
    this.writeJsonStub = sinon.stub(fs, 'writeJson');
  });

  afterEach('restore stubs', function() {
    sinon.restore();
  });

  describe('#report', function() {
    beforeEach('stubs sendToFirebase', async function() {
      this.sendToFirebase = sinon.stub(Telemetry, 'sendToFirebase');
    });

    context('when interactive mode is not activated', function() {
      it('does not call sendToFirebase function', async function() {
        await Telemetry.report('create', {}, false);
        expect(this.sendToFirebase.getCall(0)).to.be.null;
      });
    });

    context('when interactive mode is activated', function() {
      context('when neither local nor global options are set', function() {
        context('when the user answers no to telemetry prompted question', function() {
          beforeEach(async function() {
            this.inquirerPrompt = sinon.stub(inquirer, 'prompt').returns({ optIn: false });
          });

          it('prompts for telemetry', async function() {
            await Telemetry.report('create', {}, true);
            this.inquirerPrompt.calledOnce.should.be.true;
          });

          it('does not call sendToFirebase function', async function() {
            await Telemetry.report('create', {}, true);
            expect(this.sendToFirebase.getCall(0)).to.be.null;
          });

          it('writes local file and sets telemetryOptIn option to false', async function() {
            this.telemetryOptInSetter = sinon.stub(ProjectFile.prototype, 'exists').returns(true);
            this.telemetryOptInSetter = sinon.spy(ProjectFile.prototype, 'telemetryOptIn', ['set']);
            this.projectFileWrite = sinon.spy(ProjectFile.prototype, 'write');
            await Telemetry.report('create', {}, true);

            this.telemetryOptInSetter.set.should.have.been.calledWithExactly(false);
            this.projectFileWrite.calledOnce.should.be.true;
          });

          it('writes the global file with salt, uuid, and optIn as false', async function() {
            await Telemetry.report('create', {}, true);
            const [firstArg, secondArg] = this.writeJsonStub.getCall(0).args;

            path.basename(firstArg).should.equal('telemetry.json');
            secondArg.optIn.should.be.false;
            secondArg.uuid.should.match(/^[a-f0-9\-]+$/);
            secondArg.salt.should.match(/^[a-f0-9]+$/);
          });
        });

        context('when the user answers yes to telemetry prompted question', function() {
          beforeEach(async function() {
            this.inquirerPrompt = sinon.stub(inquirer, 'prompt').returns({ optIn: true });
          });

          it('prompts for telemetry', async function() {
            await Telemetry.report('create', {}, true);
            this.inquirerPrompt.calledOnce.should.be.true;
          });

          it('writes the global file with salt, uuid and optIn as true', async function() {
            await Telemetry.report('create', {}, true);
            const [firstArg, secondArg] = this.writeJsonStub.getCall(0).args;

            path.basename(firstArg).should.equal('telemetry.json');
            secondArg.optIn.should.be.true;
            secondArg.uuid.should.match(/^[a-f0-9\-]+$/);
            secondArg.salt.should.match(/^[a-f0-9]+$/);
          });

          it('writes local file', async function() {
            this.telemetryOptInSetter = sinon.stub(ProjectFile.prototype, 'exists').returns(true);
            this.telemetryOptInSetter = sinon.spy(ProjectFile.prototype, 'telemetryOptIn', ['set']);
            this.projectFileWrite = sinon.spy(ProjectFile.prototype, 'write');
            await Telemetry.report('create', {}, true);

            this.telemetryOptInSetter.set.should.have.been.calledWithExactly(true);
            this.projectFileWrite.calledOnce.should.be.true;
          });

          describe('sendToFirebase function call', function() {
            before(function() {
              this.commandData = {
                stringField: 'foo',
                numberField: 3,
                objectField: { stringField: 'foo', arrayField: [1, 2, 3] },
              };
            });

            context('when a non-development network is specified', function() {
              it('conceals all options recursively except for the network name', async function() {
                await Telemetry.report('create', { network: 'ropsten', ...this.commandData }, true);
                const [, commandData] = this.sendToFirebase.getCall(0).args;

                commandData.name.should.eq('create');
                commandData.network.should.eq('ropsten');
                shouldConcealOptions(commandData);
              });
            });

            context('when a dev network is specified', function() {
              it('changes the network name to development', async function() {
                await Telemetry.report('create', { network: 'dev-209384093', ...this.commandData }, true);
                const [, commandData] = this.sendToFirebase.getCall(0).args;

                commandData.name.should.eq('create');
                commandData.network.should.eq('development');
                shouldConcealOptions(commandData);
              });
            });
          });
        });
      });
    });
  });
});

function shouldConcealOptions(commandData) {
  commandData.stringField.should.match(/^[a-f0-9]{64}$/);
  commandData.numberField.should.match(/^[a-f0-9]{64}$/);
  commandData.objectField.stringField.should.match(/^[a-f0-9]{64}$/);
  commandData.objectField.arrayField[0].should.match(/^[a-f0-9]{64}$/);
  commandData.objectField.arrayField[1].should.match(/^[a-f0-9]{64}$/);
  commandData.objectField.arrayField[2].should.match(/^[a-f0-9]{64}$/);
}
