import nodemailer from 'nodemailer';

export class DevEmailService 
{
    private transporter : any;
    

    constructor() 
    {
        this.initializeTransporter();   
    }

    private async initializeTransporter() 
    {
        
    }

    async sendUserInvite(invitation : 
        {
            email : string,
            firstName : string,
            lastName : string,
            invitationToken : string,
            companyName : string,
            expiresAt : Date;
        })
        {
            const inviteUrl = `${process.env.APP_URL || 'http://localhost:3000'}/join?token=${invitation.invitationToken}`;
        
            const html = `
            <h1>You're invited to join ${invitation.companyName}</h1>
            <p>Hello ${invitation.firstName},</p>
            <p>You've been invited to join ${invitation.companyName} on our platform.</p>
            <p><a href="${inviteUrl}">Click here to accept the invitation</a></p>
            <p>This invitation will expire on ${invitation.expiresAt.toLocaleDateString()}.</p>
            `;
            const text = `
            You're invited to join ${invitation.companyName}
            
            Hello ${invitation.firstName},
            
            You've been invited to join ${invitation.companyName} on our platform.
            
            Click the link below to accept the invitation:
            ${inviteUrl}
            
            This invitation will expire on ${invitation.expiresAt.toLocaleDateString()}.
            `;
             // Send mail using the test account
            const info = await this.transporter.sendMail({
            from: '"Your App" <noreply@yourdomain.com>',
            to: "vida0@ethereal.email",
            subject: `Invitation to join ${invitation.companyName}`,
            text,
            html,
            });
            
            console.log('Message sent:', info.messageId);
            // Preview URL only works with Ethereal email accounts
            console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
            
            return {
                success: true,
                messageId: info.messageId,
                previewUrl: nodemailer.getTestMessageUrl(info),
        };
    } 
}