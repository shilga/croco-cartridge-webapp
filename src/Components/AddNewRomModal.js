import React from "react";
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import ProgressBar from 'react-bootstrap/ProgressBar';

const BANK_SIZE = 0x4000;
const CHUNK_SIZE = 32;
const CHUNKS_PER_BANK = BANK_SIZE / CHUNK_SIZE;

class AddNewRomModal extends React.Component
{
    show = this.props.show;
    onHide = this.props.onHide;
    onRomAdded = this.props.onRomAdded;
    comm = this.props.comm;

    state = {
        validRomLoaded: false,
        romInfo: { banks: 0, name: "" },
        uploadInProgress: false,
        uploadRequestInProgress: false,
        uploadedBank: 0,
        speedchangeBank: 0xFFFF
    };

    rom;

    onEnterHandler()
    {
        this.setState({validRomLoaded: false});
    }

    fileChangedHandler(e) {
        e.preventDefault();
        const fileObj = e.target.files && e.target.files[0];
        if (!fileObj) {
            console.log("no file selected");
            this.setState({validRomLoaded: false});
            return;
        }
        const enc = new TextDecoder("utf-8");
        const reader = new FileReader();
        reader.onload = (e) => {
            this.rom = new Uint8Array(e.target.result);
            console.log("ROM is " + this.rom.byteLength + "bytes long");
            var banks = 1 << (this.rom[0x0148] + 1);
            var nameArray = this.rom.subarray(0x134, 0x134 + 16);
            var isCgbGame = this.rom[0x143] === 0xC0 || (this.rom[0x143] === 0x80);
            var zero = nameArray.findIndex((element, index, array) => {return element === 0;})
            if(zero === -1)
            {
                zero = isCgbGame ? 15 : 16;
            }

            var name = enc.decode(this.rom.subarray(0x134, 0x134 + zero));
            
            console.log("ROM has " + banks + " banks");
            console.log("ROM name is " + name);
            console.log("ROM is a CGB game: " + isCgbGame);

            var speedchangeBank = 0xffff;
            if(isCgbGame)
            {
                var speedchangeState = 0;
                for(var i=0; (i<this.rom.byteLength) && (speedchangeBank === 0xffff); i++)
                {
                    switch(this.rom[i])
                    {
                    case 0xe0:
                        if(speedchangeState === 0)
                        {
                            speedchangeState = 1;
                        }
                        break;
                    case 0x4d:
                        if(speedchangeState === 1)
                        {
                            speedchangeState = 2;
                        }
                        break;
                    case 0x10:
                        if(speedchangeState === 2)
                        {
                            speedchangeBank = Math.floor(i / BANK_SIZE);
                        }
                        break;
                    default:
                        if(speedchangeState === 1)
                        {
                            speedchangeState = 0;
                        }
                    }
                }
            }

            console.log("Speed change happens in bank " + speedchangeBank);
            this.setState({validRomLoaded: true, romInfo: { banks: banks, name: name, speedchangeBank: speedchangeBank } });
        };
        reader.readAsArrayBuffer(fileObj);
    }

    async romUploadButtonHandler () {
        console.log("Starting upload of " + this.state.romInfo.banks + " banks with speedSwitchBank=" + this.state.romInfo.speedchangeBank);

        this.setState({uploadInProgress: true, uploadRequestInProgress: true, uploadedBank: this.state.romInfo.banks});
        await this.comm.requestRomUploadCommand(this.state.romInfo.banks, this.state.romInfo.name, this.state.romInfo.speedchangeBank);

        console.log("Upload was accepted");

        this.setState({uploadRequestInProgress: false, uploadedBank: 0});

        for (var bank = 0; bank < this.state.romInfo.banks; bank++) {
            for (var chunk = 0; chunk < CHUNKS_PER_BANK; chunk++) {
                await this.comm.sendRomChunkCommand(bank, chunk, this.rom.subarray((bank * BANK_SIZE) + (chunk * CHUNK_SIZE), (bank * BANK_SIZE) + ((chunk + 1) * CHUNK_SIZE)));
                console.log("Bank " + bank + " chunk " + chunk);
            }
            this.setState({uploadedBank: bank});
        }

        console.log("Upload finished");
        this.setState({uploadInProgress: false});

        this.onRomAdded();
    }

    render() {
        return (
            <Modal
                show={this.props.show}
                onHide={this.onHide}
                onEnter={() => this.onEnterHandler()}
                size="lg"
                aria-labelledby="contained-modal-title-vcenter"
                centered
            >
                <Modal.Header closeButton>Add a new ROM</Modal.Header>
                <Modal.Body>
                    <Form>
                        <Form.Group as={Row}>
                            <Form.Label column sm="2">Select ROM</Form.Label>
                            <Col sm="10">
                            <Form.Control type="file" onChange={(e) => this.fileChangedHandler(e)} disabled={this.state.uploadInProgress} />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column sm="2">ROM Name:</Form.Label>
                            <Col sm="10">
                            <Form.Control plaintext maxLength={16} value={this.state.romInfo.name} onChange={(e) => this.setState({romInfo: {name: e.target.value, banks: this.state.romInfo.banks, speedchangeBank: this.state.romInfo.speedchangeBank}})} />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column sm="2">ROM Banks:</Form.Label>
                            <Col sm="10">
                            <Form.Control plaintext readOnly value={this.state.romInfo.banks} />
                            </Col>
                        </Form.Group>
                    </Form>

                    {this.state.uploadInProgress && <ProgressBar animated={this.state.uploadRequestInProgress} now={this.state.uploadedBank} max={this.state.romInfo.banks} />}
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={this.onHide}>Close</Button>
                    <Button onClick={() => this.romUploadButtonHandler()} disabled={!this.state.validRomLoaded}>Upload</Button>
                </Modal.Footer>

            </Modal>
        );
    }
};

export default AddNewRomModal;